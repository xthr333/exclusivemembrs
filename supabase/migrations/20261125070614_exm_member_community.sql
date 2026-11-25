alter table exm_member.profiles
  add column creative_roles text[] not null default '{}',
  add constraint exm_member_creative_roles_check check (
    cardinality(creative_roles) <= 8
    and array_position(creative_roles, null) is null
    and creative_roles <@ array[
      'artist','producer','songwriter','photographer','filmmaker','animator',
      'streamer','gamer','designer','entertainer','creator'
    ]::text[]
  );
grant update (creative_roles) on exm_member.profiles to service_role;

create index exm_member_profiles_directory_idx on exm_member.profiles (username) where discoverable;
create index exm_member_profiles_creative_roles_idx on exm_member.profiles using gin (creative_roles)
  where discoverable;

create table exm_member.follows (
  follower_id uuid not null references exm_member.profiles(id) on delete cascade,
  followed_id uuid not null references exm_member.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followed_id),
  check (follower_id <> followed_id)
);
create index exm_member_follows_followed_idx on exm_member.follows (followed_id, follower_id);
alter table exm_member.follows enable row level security;
revoke all on exm_member.follows from public, anon, authenticated;
grant select, insert, delete on exm_member.follows to service_role;

create or replace function public.exm_member_session(p_token text) returns jsonb
language sql stable security invoker set search_path = ''
as $$
  select jsonb_build_object(
    'id', profile.id, 'username', profile.username, 'displayName', profile.display_name,
    'bio', profile.bio, 'discoverable', profile.discoverable, 'creativeRoles', profile.creative_roles
  )
  from exm_member.sessions as session
  join exm_member.profiles as profile on profile.id = session.profile_id
  where session.token_hash = p_token and session.expires_at > now();
$$;

create function public.exm_member_save_profile(
  p_token text, p_display_name text, p_bio text, p_discoverable boolean, p_roles text[]
) returns boolean
language sql security invoker set search_path = ''
as $$
  with changed as (
    update exm_member.profiles as profile
    set display_name = p_display_name, bio = p_bio, discoverable = p_discoverable, creative_roles = p_roles
    from exm_member.sessions as session
    where profile.id = session.profile_id and session.token_hash = p_token
      and session.expires_at > now()
    returning 1
  )
  select exists (select 1 from changed);
$$;

create function public.exm_member_directory(p_query text, p_role text, p_after text)
returns jsonb
language sql stable security invoker set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'username', page.username, 'displayName', page.display_name, 'creativeRoles', page.creative_roles
  ) order by page.username), '[]'::jsonb)
  from (
    select username, display_name, creative_roles from exm_member.profiles
    where discoverable and username > p_after
      and (p_query = '' or position(p_query in username) > 0 or position(p_query in lower(display_name)) > 0)
      and (p_role = '' or creative_roles @> array[p_role])
    order by username
    limit 21
  ) as page;
$$;

create function public.exm_member_public_profile(p_username text, p_viewer text)
returns jsonb
language sql stable security invoker set search_path = ''
as $$
  with viewer as (
    select profile_id from exm_member.sessions where token_hash = p_viewer and expires_at > now()
  )
  select jsonb_build_object(
    'username', profile.username, 'displayName', profile.display_name, 'bio', profile.bio,
    'creativeRoles', profile.creative_roles,
    'followers', (select count(*) from exm_member.follows as edge
      join exm_member.profiles as source on source.id = edge.follower_id
      where edge.followed_id = profile.id and source.discoverable),
    'following', (select count(*) from exm_member.follows as edge
      join exm_member.profiles as destination on destination.id = edge.followed_id
      where edge.follower_id = profile.id and destination.discoverable),
    'canFollow', exists (select 1 from viewer where profile_id <> profile.id),
    'isFollowing', exists (select 1 from exm_member.follows as edge
      join viewer on viewer.profile_id = edge.follower_id where edge.followed_id = profile.id)
  )
  from exm_member.profiles as profile
  where profile.username = p_username and profile.discoverable;
$$;

create function public.exm_member_set_follow(p_token text, p_username text, p_follow boolean)
returns boolean
language plpgsql security invoker set search_path = ''
as $$
declare
  actor uuid;
  target uuid;
begin
  select profile_id into actor from exm_member.sessions
    where token_hash = p_token and expires_at > now();
  if actor is null then
    return null;
  end if;
  select id into target from exm_member.profiles
    where username = p_username and discoverable;
  if target is null or actor = target then
    return false;
  end if;
  if p_follow then
    insert into exm_member.follows (follower_id, followed_id)
      values (actor, target) on conflict do nothing;
  else
    delete from exm_member.follows where follower_id = actor and followed_id = target;
  end if;
  return true;
end;
$$;

revoke all on function
  public.exm_member_save_profile(text, text, text, boolean, text[]),
  public.exm_member_directory(text, text, text), public.exm_member_public_profile(text, text),
  public.exm_member_set_follow(text, text, boolean)
  from public, anon, authenticated;
grant execute on function
  public.exm_member_save_profile(text, text, text, boolean, text[]),
  public.exm_member_directory(text, text, text), public.exm_member_public_profile(text, text),
  public.exm_member_set_follow(text, text, boolean)
  to service_role;
