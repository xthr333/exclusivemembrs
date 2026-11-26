-- Preserve the normal directory rule and allow the authenticated member to view their own profile.
create or replace function public.exm_member_public_profile_base(p_username text,p_viewer text)
returns jsonb language sql stable set search_path = ''
as $$
  with viewer as (select exm_member.actor(p_viewer) as id)
  select jsonb_build_object(
    'username',p.username,'displayName',p.display_name,'bio',p.bio,'avatar',p.avatar,'links',p.links,
    'creativeRoles',p.creative_roles,
    'staffRoles',coalesce((select jsonb_agg(s.role order by s.role) from exm_member.staff s where s.profile_id=p.id),'[]'),
    'champion',exists(select 1 from exm_member.inventory i where i.profile_id=p.id and i.reward='champion-badge'),
    'verifiedActivity',coalesce((select jsonb_agg(to_jsonb(h) order by occurred_at desc) from (
      select activity,occurred_at from exm_member.ledger
      where profile_id=p.id and activity in ('event_participation','songwars_participation','battle_win','finals','championship','judging')
      order by occurred_at desc limit 10
    ) h),'[]'),
    'followers',(select count(*) from exm_member.follows f join exm_member.profiles m on m.id=f.follower_id
      where f.followed_id=p.id and m.discoverable),
    'following',(select count(*) from exm_member.follows f join exm_member.profiles m on m.id=f.followed_id
      where f.follower_id=p.id and m.discoverable),
    'canFollow',exists(select 1 from viewer where id<>p.id),
    'isFollowing',exists(select 1 from exm_member.follows f join viewer v on v.id=f.follower_id where f.followed_id=p.id)
  )
  from exm_member.profiles p cross join viewer
  where p.username=p_username and (p.discoverable or p.id=viewer.id)
$$;

create or replace function public.exm_member_public_profile(p_username text, p_viewer text) returns jsonb
language plpgsql stable set search_path = ''
as $$
declare viewer uuid := exm_member.actor(p_viewer);
declare subject uuid;
declare profile jsonb;
begin
  profile := public.exm_member_public_profile_base(p_username,p_viewer);
  if profile is null then return null; end if;
  select id into subject from exm_member.profiles where username=p_username;
  return profile || jsonb_strip_nulls(jsonb_build_object(
    'isSelf',coalesce(viewer=subject,false),
    'publiclyVisible',case when viewer=subject then (
      select discoverable from exm_member.profiles where id=subject
    ) end,
    'founder',exists(select 1 from exm_member.founder_authority where profile_id=subject),
    'rosterCategory',(select category from exm_member.roster_credits where profile_id=subject),
    'canFollow',(profile->>'canFollow')::boolean and exm_member.can_interact(viewer,subject),
    'canBlock',viewer is not null and viewer<>subject,
    'blockedByViewer',exists(select 1 from exm_member.blocks where blocker_id=viewer and blocked_id=subject)
  ));
end;
$$;
