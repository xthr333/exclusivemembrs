-- Apply to the isolated member Auth project. The legacy updates schema and
-- external SongWars databases have no dependency on this migration.
create schema exm_member;
revoke all on schema exm_member from public, anon, authenticated;
grant usage on schema exm_member to service_role;

create table exm_member.reserved_handles (
  username text primary key
);

-- Protect existing public handles and EXM service names before signup opens.
-- These reservations are not evidence of ownership or historical participation.
insert into exm_member.reserved_handles (username) values
  ('admin'), ('exm'), ('exclusivemembrs'), ('owner'), ('staff'), ('support'), ('songwars'),
  ('03wayne'), ('wayne'), ('1chrxllo'), ('1ilriskk'), ('bitchyounotayop'), ('luciifrmla'),
  ('mayo'), ('mayo_'), ('vantiva'), ('vontae'), ('tiva'), ('ybdd'), ('ydm-ski'),
  ('youngcj2x'), ('ballhogs'), ('yopz');

create table exm_member.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9][a-z0-9_-]{2,23}$'),
  display_name text not null check (char_length(display_name) between 1 and 60),
  bio text not null default '' check (char_length(bio) <= 600),
  discoverable boolean not null default true,
  created_at timestamptz not null default now(),
  recovery_issued_at timestamptz
);

create table exm_member.sessions (
  token_hash text primary key check (token_hash ~ '^[a-f0-9]{64}$'),
  profile_id uuid not null references exm_member.profiles(id) on delete cascade,
  expires_at timestamptz not null
);
create index exm_member_sessions_profile_idx on exm_member.sessions (profile_id);
create index exm_member_sessions_expires_idx on exm_member.sessions (expires_at);

create table exm_member.recovery_codes (
  code_hash text primary key check (code_hash ~ '^[a-f0-9]{64}$'),
  profile_id uuid not null references exm_member.profiles(id) on delete cascade
);
create index exm_member_recovery_profile_idx on exm_member.recovery_codes (profile_id);

create table exm_member.recovery_cases (
  reference uuid primary key default gen_random_uuid(),
  profile_id uuid not null references exm_member.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index exm_member_recovery_cases_profile_idx on exm_member.recovery_cases (profile_id);
create index exm_member_recovery_cases_created_idx on exm_member.recovery_cases (created_at);

create table exm_member.rate_buckets (
  bucket text not null check (bucket ~ '^[a-f0-9]{64}$'),
  window_id bigint not null,
  hits integer not null check (hits > 0),
  primary key (bucket, window_id)
);
create index exm_member_rate_buckets_window_idx on exm_member.rate_buckets (window_id);

alter table exm_member.reserved_handles enable row level security;
alter table exm_member.profiles enable row level security;
alter table exm_member.sessions enable row level security;
alter table exm_member.recovery_codes enable row level security;
alter table exm_member.recovery_cases enable row level security;
alter table exm_member.rate_buckets enable row level security;

revoke all on all tables in schema exm_member from public, anon, authenticated;
grant select on exm_member.profiles to service_role;
grant update (display_name, bio, discoverable, recovery_issued_at) on exm_member.profiles to service_role;
grant select, insert, delete on exm_member.sessions, exm_member.recovery_codes,
  exm_member.recovery_cases to service_role;
grant select, insert, update, delete on exm_member.rate_buckets to service_role;

-- Auth creation and username reservation share one transaction. Only
-- Auth admin metadata is trusted; user metadata is writable by the member.
create function exm_member.provision_profile() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  handle text := new.raw_app_meta_data ->> 'exm_username';
begin
  if handle is null then
    return new;
  end if;
  if exists (select 1 from exm_member.profiles where id = new.id and username = handle) then
    return new;
  end if;
  if new.email is null or new.email !~ '^[a-f0-9]{64}@members\.exclusivemembrs\.com$'
    or exists (select 1 from exm_member.reserved_handles where username = handle)
  then
    raise exception 'Member handle unavailable';
  end if;
  insert into exm_member.profiles (id, username, display_name)
    values (new.id, handle, handle);
  return new;
end;
$$;
revoke all on function exm_member.provision_profile() from public, anon, authenticated;
-- GoTrue admin creation can add app_metadata after its initial INSERT.
create trigger exm_member_provision after insert or update of raw_app_meta_data on auth.users
  for each row execute function exm_member.provision_profile();

create function public.exm_member_rate(p_bucket text, p_max int) returns boolean
language sql security invoker set search_path = ''
as $$
  insert into exm_member.rate_buckets as bucket (bucket, window_id, hits)
    values (p_bucket, floor(extract(epoch from clock_timestamp()) / 900)::bigint, 1)
    on conflict (bucket, window_id) do update set hits = least(bucket.hits + 1, p_max + 1)
  returning hits <= p_max;
$$;

create function public.exm_member_open_session(p_id uuid, p_token text, p_codes text[])
returns boolean
language plpgsql security invoker set search_path = ''
as $$
declare
  issue_codes boolean;
begin
  select recovery_issued_at is null into issue_codes from exm_member.profiles
    where id = p_id for update;
  if not found then
    return null;
  end if;
  insert into exm_member.sessions (token_hash, profile_id, expires_at)
    values (p_token, p_id, now() + interval '1 day');
  if issue_codes then
    insert into exm_member.recovery_codes (code_hash, profile_id)
      select unnest(p_codes), p_id;
    update exm_member.profiles set recovery_issued_at = now() where id = p_id;
  end if;
  return issue_codes;
end;
$$;

create function public.exm_member_session(p_token text) returns jsonb
language sql stable security invoker set search_path = ''
as $$
  select jsonb_build_object(
    'id', profile.id, 'username', profile.username, 'displayName', profile.display_name,
    'bio', profile.bio, 'discoverable', profile.discoverable
  )
  from exm_member.sessions as session
  join exm_member.profiles as profile on profile.id = session.profile_id
  where session.token_hash = p_token and session.expires_at > now();
$$;

create function public.exm_member_close_session(p_token text) returns void
language sql security invoker set search_path = ''
as $$
  delete from exm_member.sessions where token_hash = p_token;
$$;

create function public.exm_member_update_profile(
  p_token text, p_display_name text, p_bio text, p_discoverable boolean
) returns boolean
language sql security invoker set search_path = ''
as $$
  with changed as (
    update exm_member.profiles as profile
    set display_name = p_display_name, bio = p_bio, discoverable = p_discoverable
    from exm_member.sessions as session
    where profile.id = session.profile_id and session.token_hash = p_token
      and session.expires_at > now()
    returning 1
  )
  select exists (select 1 from changed);
$$;

create function public.exm_member_start_recovery(p_username text, p_code text) returns uuid
language sql security invoker set search_path = ''
as $$
  with redeemed as (
    delete from exm_member.recovery_codes as code
    using exm_member.profiles as profile
    where code.profile_id = profile.id and profile.username = p_username
      and code.code_hash = p_code
    returning code.profile_id
  )
  insert into exm_member.recovery_cases (profile_id) select profile_id from redeemed
  returning reference;
$$;

create function public.exm_member_prune() returns void
language sql security invoker set search_path = ''
as $$
  delete from exm_member.sessions where expires_at <= now();
  delete from exm_member.rate_buckets
    where window_id < floor(extract(epoch from clock_timestamp()) / 900)::bigint - 1;
  delete from exm_member.recovery_cases where created_at < now() - interval '7 days';
$$;

revoke all on function
  public.exm_member_rate(text, int), public.exm_member_open_session(uuid, text, text[]),
  public.exm_member_session(text), public.exm_member_close_session(text),
  public.exm_member_update_profile(text, text, text, boolean),
  public.exm_member_start_recovery(text, text), public.exm_member_prune()
  from public, anon, authenticated;
grant execute on function
  public.exm_member_rate(text, int), public.exm_member_open_session(uuid, text, text[]),
  public.exm_member_session(text), public.exm_member_close_session(text),
  public.exm_member_update_profile(text, text, text, boolean),
  public.exm_member_start_recovery(text, text), public.exm_member_prune()
  to service_role;
