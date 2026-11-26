-- Approved spendable awards. The previous ledger and all existing XP rules stay intact.
insert into exm_member.award_rules(activity,xp,points)
values ('first_bio',0,10),('first_avatar',0,10)
on conflict (activity) do update set points=excluded.points;

update exm_member.award_rules r set points=v.points
from (values ('profile_complete',0),('check_in',5),('event_participation',25),
  ('songwars_participation',25),('judging',25),('battle_win',10),('finals',0),('championship',50))
  as v(activity,points)
where r.activity=v.activity;

-- Keep entitlements on the immutable verified roster handle until the owner links its account.
create table if not exists exm_member.songwars_reward_reservations (
  season text not null references exm_member.songwars_legacy_seasons(season),
  person text not null references exm_member.roster_credits(handle),
  source_key text not null,
  activity text not null check(activity in ('songwars_participation','battle_win','championship')),
  points integer not null check(points in (10,25,50)),
  profile_id uuid references exm_member.profiles(id),
  existing_points integer check(existing_points >= 0),
  credited_points integer check(credited_points between 0 and points),
  status text not null default 'reserved' check(status in ('reserved','held','settled')),
  settled_at timestamptz,
  primary key(season,person,source_key)
);
create index if not exists exm_songwars_reward_person_idx
  on exm_member.songwars_reward_reservations(person,season,source_key);
alter table exm_member.songwars_reward_reservations enable row level security;
revoke all on exm_member.songwars_reward_reservations from public,anon,authenticated;
grant select,update on exm_member.songwars_reward_reservations to service_role;

-- One source of truth for dry runs and reservations. A published played match proves
-- participation. A title row alone never proves an additional played match or attendance.
create or replace view exm_member.songwars_reward_candidates with (security_invoker=true) as
select distinct c.season,c.person,'participation'::text as source_key,
  'songwars_participation'::text as activity,25 as points
from exm_member.songwars_legacy_credits c
join exm_member.songwars_legacy_seasons s on s.season=c.season and s.verification='verified'
join exm_member.songwars_legacy_matches m on m.season=c.season and m.verification='verified'
  and c.team in (m.winner,m.opponent)
union all
select c.season,c.person,'win:'||m.match_key,'battle_win',10
from exm_member.songwars_legacy_credits c
join exm_member.songwars_legacy_seasons s on s.season=c.season and s.verification='verified'
join exm_member.songwars_legacy_matches m on m.season=c.season and m.verification='verified' and m.winner=c.team
union all
select s.season,t.handle,'championship','championship',50
from exm_member.roster_titles t
join exm_member.songwars_legacy_seasons s on s.season='s'||t.season::text and s.verification='verified';
revoke all on exm_member.songwars_reward_candidates from public,anon,authenticated;

create or replace function exm_member.reward_participation_class(activity text)
returns text language sql immutable strict set search_path=''
as $$
  select case when activity in ('event_participation','songwars_participation','judging')
    then 'participation' else activity end
$$;

create or replace function exm_member.reward_source_key(source text)
returns text language sql immutable strict set search_path=''
as $$
  select trim(both '-' from regexp_replace(lower(btrim(source)),'[^a-z0-9]+','-','g'))
$$;

-- Compare the documented references used by prior verifiers. Unknown positive credits
-- of the same type are held for review rather than guessed to be new or equivalent.
create or replace function exm_member.songwars_reward_equivalent(
  ledger_activity text,ledger_key text,season_key text,source_key text,reward_activity text
) returns boolean language sql immutable strict set search_path=''
as $$
  with aliases as (
    select unnest(case season_key
      when 's2' then array['s2','season-2','season-ii','songwars-2','songwars-ii','songwars-s2']
      when 's3' then array['s3','season-3','season-iii','songwars-3','songwars-iii','songwars-s3','songwars-iii-double-impact']
      else array[season_key] end) as alias
  )
  select exm_member.reward_participation_class(ledger_activity)=exm_member.reward_participation_class(reward_activity)
    and (ledger_key='legacy-reward:'||season_key||':'||source_key
      or (ledger_key like 'verified:'||ledger_activity||':%' and exists (
        select 1 from aliases
        where exm_member.reward_source_key(substr(ledger_key,length('verified:'||ledger_activity||':')+1))
          =alias||case when source_key like 'win:%' then '-'||exm_member.reward_source_key(substr(source_key,5)) else '' end
      )))
$$;

create or replace function exm_member.settle_songwars_rewards(p_person text)
returns void language plpgsql set search_path=''
as $$
declare member uuid;
declare reservation exm_member.songwars_reward_reservations;
declare credits integer;
declare remainder integer;
declare wallet_key text;
begin
  select profile_id into member from exm_member.roster_credits where handle=p_person for update;
  if member is null then return; end if;
  -- Use the same account lock as awards, balance changes and redemption.
  perform id from exm_member.profiles where id=member for update;
  for reservation in
    select * from exm_member.songwars_reward_reservations
    where person=p_person and status<>'settled' order by season,source_key for update
  loop
    wallet_key := 'legacy-reward:'||reservation.season||':'||reservation.source_key;
    select coalesce(sum(points),0)::integer into credits
    from exm_member.ledger l
    where l.profile_id=member and l.points>0 and exm_member.songwars_reward_equivalent(
      l.activity,l.event_key,reservation.season,reservation.source_key,reservation.activity);

    -- A prior positive award with incomplete provenance can match any of the remaining
    -- results in this category. Identified awards for other SongWars matches/seasons
    -- and canonical references to other EXM events do not block settlement.
    if credits<reservation.points and exists (
      select 1 from exm_member.ledger l
      where l.profile_id=member and l.points>0
        and exm_member.reward_participation_class(l.activity)=exm_member.reward_participation_class(reservation.activity)
        and not exists (select 1 from exm_member.songwars_reward_reservations known
          where known.person=p_person and exm_member.songwars_reward_equivalent(
            l.activity,l.event_key,known.season,known.source_key,known.activity))
        and not exists (select 1 from exm_member.events e
          where l.event_key='verified:'||l.activity||':'||e.id::text)
    ) then
      update exm_member.songwars_reward_reservations
      set profile_id=member,existing_points=credits,status='held'
      where season=reservation.season and person=p_person and source_key=reservation.source_key;
      continue;
    end if;

    remainder := greatest(reservation.points-credits,0);
    if remainder>0 then
      insert into exm_member.ledger(profile_id,event_key,activity,xp,points,season)
      values(member,wallet_key,reservation.activity,0,remainder,reservation.season)
      on conflict (profile_id,event_key) do nothing;
      if not found then
        raise exception 'Historical reward wallet key requires reconciliation: %', wallet_key;
      end if;
    end if;
    update exm_member.songwars_reward_reservations
    set profile_id=member,existing_points=credits,credited_points=remainder,status='settled',settled_at=now()
    where season=reservation.season and person=p_person and source_key=reservation.source_key;
  end loop;
end;
$$;

create or replace function exm_member.settle_songwars_rewards_after_claim()
returns trigger language plpgsql set search_path=''
as $$
begin
  perform exm_member.settle_songwars_rewards(new.handle);
  return new;
end;
$$;

drop trigger if exists exm_songwars_reward_claim on exm_member.roster_credits;
create trigger exm_songwars_reward_claim after update of profile_id on exm_member.roster_credits
  for each row when (old.profile_id is null and new.profile_id is not null)
  execute function exm_member.settle_songwars_rewards_after_claim();

-- Duplicates across applicable roles share an event reference for the spendable participation
-- award. Existing XP amounts, roles, audit records and distinct battle results remain unchanged.
create or replace function exm_member.add_award(
  member uuid,rule text,source_key text,activity_categories text[] default '{}'
) returns boolean language plpgsql set search_path=''
as $$
declare config exm_member.award_rules;
declare points_to_add integer;
declare source text;
begin
  perform id from exm_member.profiles where id=member for update;
  if not found then return false; end if;
  select * into config from exm_member.award_rules where activity=rule;
  if not found then return false; end if;
  points_to_add := config.points;
  if source_key like 'verified:'||rule||':%' then
    source := exm_member.reward_source_key(substr(source_key,length('verified:'||rule||':')+1));
    -- Keep the same activity and lookup key idempotent even when a reference is retyped.
    if exists (select 1 from exm_member.ledger l where l.profile_id=member and l.activity=rule
      and l.event_key like 'verified:'||rule||':%'
      and exm_member.reward_source_key(substr(l.event_key,length('verified:'||rule||':')+1))=source)
    then return false; end if;

    if exm_member.reward_participation_class(rule)='participation' and exists (
      select 1 from exm_member.ledger l where l.profile_id=member and l.points>0
        and exm_member.reward_participation_class(l.activity)='participation'
        and l.event_key like 'verified:'||l.activity||':%'
        and exm_member.reward_source_key(substr(l.event_key,length('verified:'||l.activity||':')+1))=source
    ) then points_to_add := 0; end if;

    if exists (select 1 from exm_member.songwars_reward_reservations r
      join exm_member.roster_credits c on c.handle=r.person and c.profile_id=member
      where exm_member.songwars_reward_equivalent(rule,add_award.source_key,r.season,r.source_key,r.activity)
    ) then points_to_add := 0; end if;
  end if;
  insert into exm_member.ledger(profile_id,event_key,activity,xp,points,categories,season)
  values(member,source_key,rule,config.xp,points_to_add,activity_categories,
    (select season_key from exm_member.platform_settings))
  on conflict(profile_id,event_key) do nothing;
  return found;
end;
$$;

-- Earlier saves may predate the rules. A later successful save of a valid nonempty
-- bio or stored custom photo can collect its first milestone. Neither save pays twice.
create or replace function public.exm_member_save_profile(p_token text,p_name text,p_bio text,p_visible boolean,
  p_roles text[],p_avatar text,p_links jsonb,p_image text)
returns jsonb language plpgsql security invoker set search_path=''
as $$
declare who uuid := exm_member.actor(p_token);
declare has_image boolean;
declare granted text[] := '{}';
begin
  if who is null then return null; end if;
  perform id from exm_member.profiles where id=who for update;
  select exists(select 1 from exm_member.profile_avatars where profile_id=who) into has_image;
  if p_avatar='custom' and p_image is null and not has_image then
    return jsonb_build_object('error','image_missing');
  end if;
  if p_image is not null then
    insert into exm_member.profile_avatars(profile_id,image) values(who,decode(p_image,'base64'))
      on conflict(profile_id) do update set image=excluded.image;
  end if;
  if not public.exm_member_identity(p_token,p_name,p_bio,p_visible,p_roles,p_avatar,p_links) then return null; end if;
  if btrim(p_bio)<>'' and exm_member.add_award(who,'first_bio','first-bio') then
    granted := array_append(granted,'first_bio');
  end if;
  if p_avatar='custom' and (p_image is not null or has_image)
    and exm_member.add_award(who,'first_avatar','first-avatar') then
    granted := array_append(granted,'first_avatar');
  end if;
  return jsonb_build_object('saved',true,'awards',granted,'progress',exm_member.progress(who,true));
end;
$$;

revoke all on function exm_member.reward_participation_class(text),exm_member.reward_source_key(text),
  exm_member.songwars_reward_equivalent(text,text,text,text,text),exm_member.settle_songwars_rewards(text),
  exm_member.settle_songwars_rewards_after_claim(),exm_member.add_award(uuid,text,text,text[]),
  public.exm_member_save_profile(text,text,text,boolean,text[],text,jsonb,text) from public,anon,authenticated;
grant execute on function exm_member.reward_participation_class(text),exm_member.reward_source_key(text),
  exm_member.songwars_reward_equivalent(text,text,text,text,text),exm_member.settle_songwars_rewards(text),
  exm_member.settle_songwars_rewards_after_claim(),exm_member.add_award(uuid,text,text,text[]),
  public.exm_member_save_profile(text,text,text,boolean,text[],text,jsonb,text) to service_role;

insert into exm_member.songwars_reward_reservations(season,person,source_key,activity,points)
select season,person,source_key,activity,points from exm_member.songwars_reward_candidates
on conflict(season,person,source_key) do nothing;

-- Re-running the reservation import never rewrites settled rows or duplicates payouts.
do $$
declare linked record;
begin
  for linked in select handle from exm_member.roster_credits c where profile_id is not null
    and exists(select 1 from exm_member.songwars_reward_reservations r where r.person=c.handle)
    order by handle
  loop
    perform exm_member.settle_songwars_rewards(linked.handle);
  end loop;
end;
$$;
