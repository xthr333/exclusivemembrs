-- Only the owner-verified roster claim can associate an artist with a member.
-- Return a destination only for a member whose directory profile is public.
create or replace function public.exm_member_roster_credits() returns jsonb
language sql stable security invoker set search_path = ''
as $$
  select jsonb_agg((jsonb_build_object(
    'handle',r.handle,'credit',r.credit,'category',r.category,'route',r.route,
    'linked',r.profile_id is not null,
    'founder',exists(select 1 from exm_member.founder_authority f where f.profile_id=r.profile_id),
    'titles',coalesce((select jsonb_agg(jsonb_build_object(
      'season',t.season,'title',t.title,'team',t.team,'creditedAs',t.credited_as
    ) order by t.season) from exm_member.roster_titles t where t.handle=r.handle),'[]')
  ) || case when p.id is not null then jsonb_build_object('publicUsername',p.username)
            else '{}'::jsonb end) order by r.handle)
  from exm_member.roster_credits r
  left join exm_member.profiles p on p.id=r.profile_id and p.discoverable
$$;

-- Keep the existing visibility and self-view checks before adding a credit.
create or replace function public.exm_member_public_profile(p_username text, p_viewer text) returns jsonb
language plpgsql stable security invoker set search_path = ''
as $$
declare viewer uuid := exm_member.actor(p_viewer);
declare subject uuid;
declare profile jsonb;
declare roster exm_member.roster_credits;
begin
  profile := public.exm_member_public_profile_base(p_username,p_viewer);
  if profile is null then return null; end if;
  select id into subject from exm_member.profiles where username=p_username;
  select * into roster from exm_member.roster_credits where profile_id=subject;
  return profile || jsonb_strip_nulls(jsonb_build_object(
    'isSelf',coalesce(viewer=subject,false),
    'publiclyVisible',case when viewer=subject then (
      select discoverable from exm_member.profiles where id=subject
    ) end,
    'founder',exists(select 1 from exm_member.founder_authority where profile_id=subject),
    'rosterCategory',roster.category,
    'rosterHandle',roster.handle,
    'canFollow',(profile->>'canFollow')::boolean and exm_member.can_interact(viewer,subject),
    'canBlock',viewer is not null and viewer<>subject,
    'blockedByViewer',exists(select 1 from exm_member.blocks where blocker_id=viewer and blocked_id=subject)
  ));
end;
$$;

revoke all on function public.exm_member_roster_credits(),
  public.exm_member_public_profile(text,text) from public,anon,authenticated;
grant execute on function public.exm_member_roster_credits(),
  public.exm_member_public_profile(text,text) to service_role;
