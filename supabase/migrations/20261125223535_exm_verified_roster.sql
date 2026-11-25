-- Published roster credits do not create logins or confer authorization.
create table exm_member.roster_credits (
  handle text primary key references exm_member.reserved_handles(username),
  credit text not null,
  category text not null check (category in ('artist','producer','roster')),
  route text not null unique,
  profile_id uuid unique references exm_member.profiles(id) on delete set null
);
insert into exm_member.reserved_handles (username) values ('oxxx') on conflict do nothing;
insert into exm_member.roster_credits (handle,credit,category,route) values
  ('ybdd','Ybdd','artist','/ybdd'),
  ('03wayne','03WAYNE','artist','/03wayne'),
  ('1ilriskk','1ILRISKK','artist','/1ilriskk'),
  ('luciifrmla','LUCIIFRMLA','artist','/luciifrmla'),
  ('mayo_','Mayo_','artist','/mayo'),
  ('youngcj2x','YOUNGCJ2X','artist','/youngcj2x'),
  ('ydm-ski','YDM SKI','artist','/ydm-ski'),
  ('bitchyounotayop','BitchYouNotAYop','artist','/bitchyounotayop'),
  ('1chrxllo','1CHRXLLO','artist','/1chrxllo'),
  ('vantiva','Vantiva','producer','/vantiva'),
  ('oxxx','OXXX','roster','/oxxx');

create table exm_member.roster_titles (
  handle text not null references exm_member.roster_credits(handle),
  season smallint not null check (season > 0),
  title text not null,
  team text,
  credited_as text not null,
  primary key (handle, season)
);
insert into exm_member.roster_titles values
  ('bitchyounotayop',2,'Season II',null,'BitchYouNotAYop'),
  ('mayo_',3,'Season III · Double Impact','BallHogs','Mayo_'),
  ('1ilriskk',3,'Season III · Double Impact','BallHogs','LR');

-- Bind production authority to the verified Auth account, never a public badge.
create table exm_member.founder_authority (
  singleton boolean primary key default true check (singleton),
  profile_id uuid unique not null references exm_member.profiles(id)
);
alter table exm_member.roster_credits enable row level security;
alter table exm_member.roster_titles enable row level security;
alter table exm_member.founder_authority enable row level security;
revoke all on exm_member.roster_credits, exm_member.roster_titles, exm_member.founder_authority
  from public,anon,authenticated;
grant select on exm_member.roster_credits, exm_member.roster_titles, exm_member.founder_authority
  to service_role;

create or replace function exm_member.allowed(actor uuid, roles text[]) returns boolean
language sql stable set search_path = ''
as $$
  select exists (
    select 1 from exm_member.staff s
    where s.profile_id=actor and (
      (s.role='owner' and (not exists(select 1 from exm_member.founder_authority)
        or exists(select 1 from exm_member.founder_authority f where f.profile_id=actor)))
      or (s.role<>'owner' and s.role=any(roles))
    )
  )
$$;

create or replace function exm_member.can_review(member uuid,event uuid) returns boolean
language sql stable set search_path = ''
as $$
  select exm_member.allowed(member,'{}')
    or (not exists(select 1 from exm_member.founder_authority)
      and exm_member.allowed(member,array['event_staff']) and exists (
        select 1 from exm_member.event_staff
        where event_id=event and member_id=member and role='event_staff'
      ))
$$;

create function public.exm_member_roster_credits() returns jsonb
language sql stable security invoker set search_path = ''
as $$
  select jsonb_agg(jsonb_build_object(
    'handle',r.handle,'credit',r.credit,'category',r.category,'route',r.route,
    'linked',r.profile_id is not null,
    'founder',exists(select 1 from exm_member.founder_authority f where f.profile_id=r.profile_id),
    'titles',coalesce((select jsonb_agg(jsonb_build_object(
      'season',t.season,'title',t.title,'team',t.team,'creditedAs',t.credited_as
    ) order by t.season) from exm_member.roster_titles t where t.handle=r.handle),'[]')
  ) order by r.handle) from exm_member.roster_credits r
$$;
revoke all on function public.exm_member_roster_credits() from public,anon,authenticated;
grant execute on function public.exm_member_roster_credits() to service_role;
