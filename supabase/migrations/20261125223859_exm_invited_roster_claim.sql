-- A roster claim requires an accepted provider invitation and the anchored founder.
-- This does not create credentials, transfer an existing profile, or assign staff.
create function exm_member.link_invited_roster(p_token text,p_handle text,p_email text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare founder uuid := exm_member.actor(p_token);
declare invited uuid;
declare roster exm_member.roster_credits;
begin
  if founder is null then return jsonb_build_object('error','signin'); end if;
  if not exists(select 1 from exm_member.founder_authority where profile_id=founder)
    or not exm_member.allowed(founder,'{}') then
    return jsonb_build_object('error','forbidden');
  end if;

  select * into roster from exm_member.roster_credits where handle=p_handle for update;
  if not found then return jsonb_build_object('error','missing'); end if;
  if roster.profile_id is not null then return jsonb_build_object('error','claimed'); end if;

  select u.id into invited from auth.users u
    where lower(u.email)=p_email and u.invited_at is not null
      and u.email_confirmed_at is not null and u.last_sign_in_at is not null
      and u.deleted_at is null
    order by u.id limit 1;
  if invited is null then return jsonb_build_object('error','unverified_invite'); end if;
  if exists(select 1 from exm_member.roster_credits where profile_id=invited) then
    return jsonb_build_object('error','claimed');
  end if;

  insert into exm_member.profiles(id,username,display_name,discoverable,creative_roles)
    values(invited,roster.handle,roster.credit,false,
      case when roster.category='roster' then '{}'::text[] else array[roster.category] end)
    on conflict(id) do nothing;
  update exm_member.roster_credits set profile_id=invited where handle=roster.handle;
  if exists(select 1 from exm_member.roster_titles where handle=roster.handle) then
    insert into exm_member.inventory(profile_id,reward) values(invited,'champion-badge') on conflict do nothing;
  end if;
  insert into exm_member.audit(actor_id,action,subject) values(founder,'verified_roster_claim',roster.handle);
  return jsonb_build_object('ok',true);
exception when unique_violation then
  return jsonb_build_object('error','claimed');
end;
$$;
revoke all on function exm_member.link_invited_roster(text,text,text) from public,anon,authenticated;
grant execute on function exm_member.link_invited_roster(text,text,text) to service_role;

create function public.exm_member_link_invited_roster(p_token text,p_handle text,p_email text)
returns jsonb language sql security invoker set search_path = ''
as $$
  select exm_member.link_invited_roster(p_token,p_handle,p_email)
$$;
revoke all on function public.exm_member_link_invited_roster(text,text,text) from public,anon,authenticated;
grant execute on function public.exm_member_link_invited_roster(text,text,text) to service_role;
