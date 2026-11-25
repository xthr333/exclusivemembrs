alter table exm_member.profiles
  add column avatar text not null default 'initials' check (avatar in ('initials','chrome')),
  add column links jsonb not null default '[]' check (jsonb_typeof(links)='array' and jsonb_array_length(links)<=3);
grant update(avatar,links) on exm_member.profiles to service_role;

create function public.exm_member_identity(p_token text,p_name text,p_bio text,p_visible boolean,
  p_roles text[],p_avatar text,p_links jsonb) returns boolean
language sql set search_path = ''
as $$
  with updated as (
    update exm_member.profiles
    set display_name=p_name,bio=p_bio,discoverable=p_visible,creative_roles=p_roles,
      avatar=coalesce(p_avatar,avatar),links=coalesce(p_links,links)
    where id=exm_member.actor(p_token) returning id
  )
  select exists(select 1 from updated)
$$;

create or replace function public.exm_member_session(p_token text) returns jsonb
language sql stable set search_path = ''
as $$
  select jsonb_build_object('id',id,'username',username,'displayName',display_name,'bio',bio,
    'discoverable',discoverable,'creativeRoles',creative_roles,'avatar',avatar,'links',links)
  from exm_member.profiles where id=exm_member.actor(p_token)
$$;

create function public.exm_member_roster(p_query text,p_role text,p_after text,p_history text,p_affiliation text)
returns jsonb language sql stable set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'username',visible.username,'displayName',visible.display_name,
    'creativeRoles',visible.creative_roles,'avatar',visible.avatar
  ) order by visible.username),'[]')
  from (
    select p.id,p.username,p.display_name,p.creative_roles,p.avatar from exm_member.profiles p
    where p.discoverable and p.username > p_after
      and (p_query='' or position(p_query in p.username)>0 or position(p_query in lower(p.display_name))>0)
      and (p_role='' or p.creative_roles @> array[p_role])
      and (p_history='' or
        (p_history='champion' and exists(select 1 from exm_member.inventory i where i.profile_id=p.id and i.reward='champion-badge'))
        or (p_history='songwars' and exists(select 1 from exm_member.ledger l where l.profile_id=p.id and l.categories @> array['songwars'])))
      and (p_affiliation='' or (p_affiliation='staff' and exists(select 1 from exm_member.staff s where s.profile_id=p.id)))
    order by p.username limit 21
  ) visible
$$;

create or replace function public.exm_member_public_profile(p_username text,p_viewer text)
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
  from exm_member.profiles p where p.username=p_username and p.discoverable
$$;

revoke all on function public.exm_member_identity(text,text,text,boolean,text[],text,jsonb),
  public.exm_member_roster(text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.exm_member_identity(text,text,text,boolean,text[],text,jsonb),
  public.exm_member_roster(text,text,text,text,text) to service_role;
