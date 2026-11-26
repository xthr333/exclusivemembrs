-- Run through psql against an isolated fixture that has all EXM migrations.
begin;
do $$
declare
  founder_id uuid;
  claimed_id uuid := gen_random_uuid();
  held_id uuid := gen_random_uuid();
  visitor_id uuid := gen_random_uuid();
  founder_token text := repeat('a',64);
  visitor_token text := repeat('b',64);
  claimed_token text := repeat('c',64);
  result jsonb;
  milestone_balance integer;
  milestone_xp integer;
  expected_milestone_xp integer;
  avatar text := 'UklGRi4AAABXRUJQVlA4ICIAAABQAQCdASoQABAAAUAmJQBOgCgAAP74I2+pW/XRVki3AAAA';
begin
  if current_database() not in ('exm_fixture','exm_rewards_rehearsal') or inet_server_addr() is not null then
    raise exception 'This test can run only in the isolated EXM fixture over a local socket.';
  end if;
  if (select count(*) from exm_member.songwars_reward_candidates)<>47
    or (select sum(points) from exm_member.songwars_reward_candidates)<>890
    or (select count(*) from exm_member.songwars_legacy_awards)<>53
    or exists(select 1 from exm_member.songwars_reward_candidates where season='s2' and source_key<>'championship')
    or exists(select 1 from exm_member.songwars_reward_candidates where season not in ('s2','s3'))
  then raise exception 'Unexpected historical reward eligibility or Legacy ledger change.'; end if;
  if exists(select 1 from exm_member.songwars_reward_reservations where person in ('mayo_','1ilriskk') and status<>'reserved')
    or has_function_privilege('anon','exm_member.settle_songwars_rewards(text)','execute')
    or has_function_privilege('authenticated','exm_member.settle_songwars_rewards(text)','execute')
    or has_table_privilege('anon','exm_member.songwars_reward_reservations','select')
  then raise exception 'Historical credit is not properly reserved or private.'; end if;

  select profile_id into founder_id from exm_member.founder_authority;
  if founder_id is null then
    founder_id := gen_random_uuid();
    insert into auth.users(id,email) values (founder_id,'historical-reward-owner@example.invalid');
    insert into exm_member.profiles(id,username,display_name) values(founder_id,'reward-owner','Rehearsal founder');
    insert into exm_member.staff(profile_id,role) values(founder_id,'owner');
    insert into exm_member.founder_authority(profile_id) values(founder_id);
  end if;
  insert into auth.users(id,email,invited_at,email_confirmed_at,last_sign_in_at) values
    (claimed_id,'historical-reward-a@example.invalid',now(),now(),now()),
    (held_id,'historical-reward-b@example.invalid',now(),now(),now()),
    (visitor_id,'historical-reward-c@example.invalid',null,now(),now());
  insert into exm_member.profiles(id,username,display_name,discoverable) values
    (claimed_id,'reward-verify-a','Verified rehearsal A',false),
    (held_id,'reward-verify-b','Verified rehearsal B',false),
    (visitor_id,'reward-verify-c','Uninvited rehearsal C',false);
  insert into exm_member.sessions(token_hash,profile_id,expires_at) values
    (founder_token,founder_id,now()+interval '1 hour'),(visitor_token,visitor_id,now()+interval '1 hour'),
    (claimed_token,claimed_id,now()+interval '1 hour');

  insert into exm_member.ledger(profile_id,event_key,activity,xp,points) values
    (claimed_id,'verified:judging:SongWars III','judging',50,12),
    (claimed_id,'verified:battle_win:SongWars_III-final','battle_win',100,30),
    (held_id,'verified:championship:Unclear previous reference','championship',0,4);
  if (public.exm_member_link_invited_roster(visitor_token,'mayo_','historical-reward-a@example.invalid')->>'error')<>'forbidden'
    or (public.exm_member_link_invited_roster(founder_token,'mayo_','historical-reward-c@example.invalid')->>'error')<>'unverified_invite'
  then raise exception 'An unverified account could claim historical rewards.'; end if;

  result := public.exm_member_link_invited_roster(founder_token,'mayo_','historical-reward-a@example.invalid');
  if result is distinct from '{"ok":true}'::jsonb
    or (select profile_id from exm_member.roster_credits where handle='mayo_')<>claimed_id
    or exm_member.wallet(claimed_id)<>135
    or (select sum(xp) from exm_member.ledger where profile_id=claimed_id)<>150
    or not exists(select 1 from exm_member.inventory where profile_id=claimed_id and reward='champion-badge')
    or not exists(select 1 from exm_member.songwars_reward_reservations where person='mayo_'
      and source_key='participation' and existing_points=12 and credited_points=13 and status='settled')
    or not exists(select 1 from exm_member.songwars_reward_reservations where person='mayo_'
      and source_key='win:final' and existing_points=30 and credited_points=0 and status='settled')
  then raise exception 'Verified claim did not reconcile the difference atomically.'; end if;

  perform exm_member.settle_songwars_rewards('mayo_');
  if (public.exm_member_link_invited_roster(founder_token,'mayo_','historical-reward-a@example.invalid')->>'error')<>'claimed'
    or exm_member.wallet(claimed_id)<>135
  then raise exception 'A replay changed the historical balance.'; end if;
  perform exm_member.add_award(claimed_id,'songwars_participation','verified:songwars_participation:season-iii');
  if exm_member.wallet(claimed_id)<>135 then raise exception 'A role alias duplicated an existing historical award.'; end if;

  result := public.exm_member_link_invited_roster(founder_token,'1ilriskk','historical-reward-b@example.invalid');
  if result is distinct from '{"ok":true}'::jsonb or exm_member.wallet(held_id)<>69
    or not exists(select 1 from exm_member.songwars_reward_reservations where person='1ilriskk'
      and source_key='championship' and status='held' and credited_points is null)
  then raise exception 'Ambiguous prior credit was not held independently of other awards.'; end if;

  milestone_balance := exm_member.wallet(claimed_id);
  select sum(xp) into milestone_xp from exm_member.ledger where profile_id=claimed_id;
  select sum(xp) into expected_milestone_xp from exm_member.award_rules where activity in ('first_bio','first_avatar');
  result := public.exm_member_save_profile(claimed_token,'Verified rehearsal A',' First bio ',false,'{}','custom','[]',avatar);
  if result->'awards' is distinct from '["first_bio","first_avatar"]'::jsonb
    or exm_member.wallet(claimed_id)<>milestone_balance+20
    or (select sum(xp) from exm_member.ledger where profile_id=claimed_id)<>milestone_xp+expected_milestone_xp
  then raise exception 'Expected 10 points for each of the first valid profile fields.'; end if;
  result := public.exm_member_save_profile(claimed_token,'Verified rehearsal A',' Edited bio ',false,'{}','custom','[]',avatar);
  if result->'awards' is distinct from '[]'::jsonb or exm_member.wallet(claimed_id)<>milestone_balance+20
  then raise exception 'A repeated save produced duplicate profile rewards.'; end if;

  if not exm_member.add_award(visitor_id,'event_participation','verified:event_participation:Test Event') then
    raise exception 'First verified participation was not added.';
  end if;
  if not exm_member.add_award(visitor_id,'judging','verified:judging:test-event') then
    raise exception 'Verified judging XP was not added.';
  end if;
  if exm_member.add_award(visitor_id,'event_participation','verified:event_participation:TEST-EVENT') then
    raise exception 'An equivalent source replay added the same activity again.';
  end if;
  if exm_member.wallet(visitor_id)<>25 then
    raise exception 'Equivalent references produced duplicate participation points.';
  end if;
end;
$$;
rollback;
