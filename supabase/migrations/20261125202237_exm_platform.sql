-- EXM member platform. Apply only to the isolated member database during preview.
create table exm_member.award_rules (
  activity text primary key,
  xp integer not null check (xp between 0 and 10000),
  points integer not null check (points between 0 and 10000)
);
insert into exm_member.award_rules values
  ('profile_complete',50,50), ('check_in',5,5), ('event_participation',25,25),
  ('songwars_participation',50,50), ('battle_win',100,100), ('finals',150,150),
  ('championship',300,300), ('judging',50,50);

create table exm_member.ledger (
  id bigint generated always as identity primary key,
  profile_id uuid not null references exm_member.profiles(id),
  event_key text not null check (length(event_key) between 1 and 160),
  activity text not null,
  xp integer not null check (xp >= 0),
  points integer not null,
  categories text[] not null default '{}' check (
    categories <@ array['artist','producer','judge','spectator','creator','songwars']::text[]
    and array_position(categories, null) is null
  ),
  occurred_at timestamptz not null default now(),
  season text,
  unique (profile_id,event_key)
);
create index exm_ledger_activity_idx on exm_member.ledger (profile_id, activity, occurred_at desc);

create table exm_member.platform_settings (
  id boolean primary key default true check (id),
  season_key text not null check (length(season_key) between 1 and 32),
  season_name text not null check (length(season_name) between 1 and 80)
);
insert into exm_member.platform_settings values (true,'preview','Preview season');

create table exm_member.staff (
  profile_id uuid not null references exm_member.profiles(id),
  role text not null check (role in ('owner','moderator','event_staff','judge')),
  primary key (profile_id,role)
);
create table exm_member.audit (
  id bigint generated always as identity primary key,
  actor_id uuid not null references exm_member.profiles(id),
  action text not null,
  subject text not null,
  detail jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create table exm_member.rewards (
  slug text primary key check (slug ~ '^[a-z0-9-]{3,40}$'),
  name text not null check (length(name) between 1 and 60),
  kind text not null check (kind in ('frame','banner','badge')),
  appearance text not null check (appearance in ('signal','chrome','ember','violet','midnight')),
  cost integer check (cost between 1 and 10000),
  active boolean not null default true
);
-- Preview costs and styles are review settings, with no cash or merchandise value.
insert into exm_member.rewards values
  ('signal-frame','Analog Signal','frame','signal',15,true),
  ('chrome-frame','Chrome Trace','frame','chrome',25,true),
  ('ember-frame','Redline','frame','ember',35,true),
  ('violet-frame','Ultraviolet','frame','violet',55,true),
  ('midnight-frame','Late Shift','frame','midnight',75,true),
  ('signal-banner','Test Pattern','banner','signal',20,true),
  ('chrome-banner','Silver Screen','banner','chrome',35,true),
  ('ember-banner','Afterimage','banner','ember',50,true),
  ('violet-banner','Night Signal','banner','violet',65,true),
  ('midnight-banner','Darkroom','banner','midnight',80,true),
  ('opening-badge','Opening Night','badge','signal',10,true),
  ('studio-badge','Studio Pass','badge','chrome',15,true),
  ('red-badge','Red Room','badge','ember',20,true),
  ('film-badge','Film Strip','badge','violet',25,true),
  ('after-hours-badge','After Hours','badge','midnight',30,true),
  ('crate-badge','Crate Digger','badge','signal',35,true),
  ('maker-badge','Maker Mark','badge','chrome',40,true),
  ('stage-badge','Stage Light','badge','ember',45,true),
  ('frequency-badge','Frequency','badge','violet',50,true),
  ('crew-badge','Crew Signal','badge','midnight',55,true),
  ('champion-badge','SongWars Champion','badge','chrome',null,true);
create table exm_member.inventory (
  profile_id uuid not null references exm_member.profiles(id),
  reward text not null references exm_member.rewards(slug),
  earned_at timestamptz not null default now(),
  primary key (profile_id,reward)
);
create table exm_member.equipped (
  profile_id uuid not null,
  kind text not null check (kind in ('frame','banner','badge')),
  reward text not null,
  primary key (profile_id,kind),
  foreign key (profile_id,reward) references exm_member.inventory(profile_id,reward)
);

create table exm_member.community_items (
  id uuid primary key,
  member_id uuid not null references exm_member.profiles(id),
  parent_id uuid references exm_member.community_items(id),
  body text not null check (length(btrim(body)) between 1 and 800),
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  check (id <> parent_id)
);
create index exm_community_recent_idx on exm_member.community_items (created_at desc, id) where parent_id is null and not hidden;
create index exm_community_children_idx on exm_member.community_items (parent_id, created_at) where not hidden;
create table exm_member.community_likes (
  item_id uuid not null references exm_member.community_items(id),
  member_id uuid not null references exm_member.profiles(id),
  primary key (item_id,member_id)
);
create table exm_member.community_reports (
  item_id uuid not null references exm_member.community_items(id),
  member_id uuid not null references exm_member.profiles(id),
  reason text not null check (reason in ('harassment','spam','privacy','other')),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (item_id,member_id)
);

alter table exm_member.award_rules enable row level security;
alter table exm_member.ledger enable row level security;
alter table exm_member.platform_settings enable row level security;
alter table exm_member.staff enable row level security;
alter table exm_member.audit enable row level security;
alter table exm_member.rewards enable row level security;
alter table exm_member.inventory enable row level security;
alter table exm_member.equipped enable row level security;
alter table exm_member.community_items enable row level security;
alter table exm_member.community_likes enable row level security;
alter table exm_member.community_reports enable row level security;

grant select, update on exm_member.platform_settings, exm_member.award_rules to service_role;
grant select, insert on exm_member.ledger, exm_member.audit, exm_member.inventory to service_role;
grant select, insert, update, delete on exm_member.staff, exm_member.equipped, exm_member.community_likes to service_role;
grant select, update on exm_member.rewards to service_role;
grant select, insert, update on exm_member.community_items, exm_member.community_reports to service_role;

create function exm_member.actor(token text) returns uuid
language sql stable set search_path = ''
as $$
  select profile_id from exm_member.sessions where token_hash = token and expires_at > now()
$$;
create function exm_member.allowed(actor uuid, roles text[]) returns boolean
language sql stable set search_path = ''
as $$
  select exists (
    select 1 from exm_member.staff where profile_id = actor and (role = 'owner' or role = any(roles))
  )
$$;
create function exm_member.wallet(member uuid) returns integer
language sql stable set search_path = ''
as $$ select coalesce(sum(points),0)::integer from exm_member.ledger where profile_id = member $$;

create function exm_member.add_award(
  member uuid, rule text, source_key text, activity_categories text[] default '{}'
) returns boolean
language plpgsql set search_path = ''
as $$
declare config exm_member.award_rules;
begin
  perform id from exm_member.profiles where id = member for update;
  if not found then return false; end if;
  select * into config from exm_member.award_rules where activity = rule;
  if not found then return false; end if;
  insert into exm_member.ledger (profile_id,event_key,activity,xp,points,categories,season)
  values (member,source_key,rule,config.xp,config.points,activity_categories,
    (select season_key from exm_member.platform_settings))
  on conflict (profile_id,event_key) do nothing;
  return found;
end;
$$;

create function exm_member.award_completed_profile() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.display_name <> new.username and length(btrim(new.bio)) > 0
      and cardinality(new.creative_roles) > 0 then
    perform exm_member.add_award(new.id,'profile_complete','profile-complete');
  end if;
  return new;
end;
$$;
create trigger exm_profile_progress after update of display_name,bio,creative_roles on exm_member.profiles
  for each row execute function exm_member.award_completed_profile();

create function exm_member.active_streak(member uuid) returns integer
language sql stable set search_path = ''
as $$
  with dates as (
    select (occurred_at at time zone 'UTC')::date as day
    from exm_member.ledger where profile_id = member and activity = 'check_in'
  ), numbered as (
    select day, row_number() over (order by day desc)::integer as position, max(day) over () as last_day from dates
  )
  select count(*)::integer from numbered
  where last_day >= (now() at time zone 'UTC')::date - 1 and day = last_day - position + 1
$$;

create function exm_member.progress(member uuid, include_wallet boolean default false) returns jsonb
language sql stable set search_path = ''
as $$
  with score as (
    select coalesce(sum(xp),0)::integer as xp from exm_member.ledger where profile_id = member
  ), rank as (
    select xp, least(100, 1 + floor(sqrt(xp::numeric / 25))::integer) as level from score
  )
  select jsonb_build_object(
    'xp',xp,'level',level,'levelFloor',25*(level-1)*(level-1),
    'nextLevelXp',case when level < 100 then 25*level*level else null end,
    'rank',case when level >= 100 then 'EXM Legend' when level >= 75 then 'EXM Icon'
      when level >= 50 then 'EXM Elite' when level >= 35 then 'Community Veteran'
      when level >= 20 then 'Established Member' when level >= 10 then 'Regular'
      when level >= 5 then 'Active Member' else 'New Member' end,
    'equipped',coalesce((select jsonb_object_agg(e.kind,jsonb_build_object('name',r.name,'appearance',r.appearance))
      from exm_member.equipped e join exm_member.rewards r on r.slug = e.reward where e.profile_id = member),'{}'::jsonb)
  ) || case when include_wallet then jsonb_build_object(
    'points',exm_member.wallet(member),
    'streak',exm_member.active_streak(member),
    'checkedIn',exists(select 1 from exm_member.ledger where profile_id = member
      and event_key = 'check-in:' || (now() at time zone 'UTC')::date::text)
  ) else '{}'::jsonb end
  from rank
$$;

create function public.exm_member_platform_read(p_token text,p_view text,p_options jsonb default '{}') returns jsonb
language plpgsql stable set search_path = ''
as $$
declare
  member uuid := exm_member.actor(p_token);
  subject uuid;
  result jsonb;
  category text := coalesce(p_options->>'category','overall');
  period text := coalesce(p_options->>'period','all');
  page_number int := coalesce((p_options->>'page')::int,1);
begin
  if p_view = 'rankings' then
    with scores as (
      select l.profile_id,sum(l.xp) as score from exm_member.ledger l
      where (category = 'overall' or l.categories @> array[category])
        and (period = 'all'
          or (period = 'season' and l.season = (select season_key from exm_member.platform_settings))
          or (period = 'month' and l.occurred_at >= (date_trunc('month', now() at time zone 'UTC') at time zone 'UTC')))
      group by l.profile_id having sum(l.xp)>0
    ), ranked as (
      select row_number() over(order by s.score desc,p.username) as rank,p.username,p.display_name,s.score
      from scores s join exm_member.profiles p on p.id = s.profile_id where p.discoverable
      order by s.score desc,p.username limit 26 offset ((page_number-1)*25)
    )
    select coalesce(jsonb_agg(to_jsonb(ranked) order by rank),'[]') into result from ranked;
    return jsonb_build_object('rows',case when jsonb_array_length(result)>25 then result - 25 else result end,
      'hasNext',jsonb_array_length(result)>25,'page',page_number,
      'season',(select season_name from exm_member.platform_settings));
  end if;
  if p_view = 'public_progress' then
    select id into subject from exm_member.profiles where discoverable and username = p_options->>'username';
    if subject is null then return jsonb_build_object('error','missing'); end if;
    return exm_member.progress(subject);
  end if;
  if member is null then return jsonb_build_object('error','signin'); end if;
  if p_view = 'dashboard' then
    return exm_member.progress(member,true) || jsonb_build_object(
      'roles',coalesce((select jsonb_agg(role order by role) from exm_member.staff where profile_id = member),'[]'),
      'username',(select username from exm_member.profiles where id = member),
      'profileComplete',(select display_name<>username and length(btrim(bio))>0 and cardinality(creative_roles)>0
        from exm_member.profiles where id = member),
      'upcoming',coalesce((select jsonb_agg(to_jsonb(upcoming) order by starts_at nulls last) from (
        select id,published->>'name' as name,(published->>'startsAt')::timestamptz as starts_at
        from exm_member.events where published->>'status' in ('scheduled','registration_open','live')
          and (published->>'startsAt' is null or (published->>'startsAt')::timestamptz >= now() or published->>'status'='live')
        order by starts_at nulls last limit 3
      ) upcoming),'[]'),
      'announcements',coalesce((select jsonb_agg(to_jsonb(n) order by pinned desc,updated_at desc) from (
        select published->>'name' as name,(published->>'pinned')::boolean as pinned,updated_at from exm_member.notices
        where published is not null and not archived
          and (published->>'publishAt' is null or (published->>'publishAt')::timestamptz<=now())
          and (published->>'expiresAt' is null or (published->>'expiresAt')::timestamptz>now())
        order by pinned desc,updated_at desc limit 3
      ) n),'[]'),
      'history',coalesce((select jsonb_agg(to_jsonb(hist) order by id desc) from (
        select id,activity,xp,points,occurred_at from exm_member.ledger where profile_id = member order by id desc limit 15
      ) hist),'[]'),
      'milestones',coalesce((select jsonb_agg(to_jsonb(m) order by m.occurred_at desc) from (
        select p.username,p.display_name,l.activity,l.occurred_at from exm_member.ledger l
        join exm_member.follows f on f.followed_id = l.profile_id and f.follower_id = member
        join exm_member.profiles p on p.id = l.profile_id and p.discoverable
        where l.activity in ('battle_win','finals','championship','judging') order by l.occurred_at desc limit 8
      ) m),'[]')
    );
  elsif p_view = 'rewards' then
    select coalesce(jsonb_agg(to_jsonb(item) order by kind,cost nulls last,name),'[]') into result
    from (select r.*,i.reward is not null as owned,e.reward is not null as equipped
      from exm_member.rewards r
      left join exm_member.inventory i on i.reward=r.slug and i.profile_id=member
      left join exm_member.equipped e on e.reward=r.slug and e.profile_id=member
      where r.active or i.reward is not null) item;
    return jsonb_build_object('points',exm_member.wallet(member),'items',result);
  elsif p_view = 'feed' then
    select coalesce(jsonb_agg(to_jsonb(post) order by created_at desc,id),'[]') into result from (
      select i.id,p.username,p.display_name,i.body,i.created_at,
        (select count(*) from exm_member.community_likes where item_id=i.id) as likes,
        exists(select 1 from exm_member.community_likes where item_id=i.id and member_id=member) as liked,
        coalesce((select jsonb_agg(to_jsonb(comment) order by created_at,id) from (
          select c.id,a.username,a.display_name,c.body,c.created_at
          from exm_member.community_items c join exm_member.profiles a on a.id=c.member_id and a.discoverable
          where c.parent_id=i.id and not c.hidden order by c.created_at desc,c.id limit 20
        ) comment),'[]') as comments
      from exm_member.community_items i join exm_member.profiles p on p.id=i.member_id and p.discoverable
      where i.parent_id is null and not i.hidden
        and (p_options->>'before' is null or i.created_at < (p_options->>'before')::timestamptz)
      order by i.created_at desc,i.id limit 20
    ) post;
    return jsonb_build_object('items',result);
  elsif p_view = 'moderation' then
    if not exm_member.allowed(member,array['moderator']) then return jsonb_build_object('error','forbidden'); end if;
    select coalesce(jsonb_agg(to_jsonb(item) order by oldest),'[]') into result from (
      select i.id,i.body,p.username,i.hidden,min(r.created_at) as oldest,array_agg(distinct r.reason) as reasons
      from exm_member.community_reports r join exm_member.community_items i on i.id=r.item_id
      join exm_member.profiles p on p.id=i.member_id
      where r.resolved_at is null group by i.id,p.username order by oldest limit 50
    ) item;
    return jsonb_build_object('items',result);
  elsif p_view = 'owner' then
    if not exm_member.allowed(member,'{}') then return jsonb_build_object('error','forbidden'); end if;
    return jsonb_build_object(
      'rules',(select jsonb_agg(to_jsonb(r) order by activity) from exm_member.award_rules r),
      'season',(select jsonb_build_object('key',season_key,'name',season_name) from exm_member.platform_settings),
      'rewards',(select jsonb_agg(to_jsonb(r) order by kind,name) from exm_member.rewards r),
      'audit',coalesce((select jsonb_agg(to_jsonb(a) order by id desc) from (
        select log.id,log.action,log.subject,log.occurred_at from exm_member.audit log order by log.id desc limit 25
      ) a),'[]')
    );
  end if;
  return jsonb_build_object('error','missing');
end;
$$;

create function public.exm_member_platform_write(p_token text,p_action text,p_payload jsonb default '{}') returns jsonb
language plpgsql set search_path = ''
as $$
declare
  member uuid := exm_member.actor(p_token);
  subject uuid;
  parent uuid;
  item uuid;
  reward exm_member.rewards;
  changed boolean;
  amount integer;
  existing text;
  selected text;
  category text;
  groups text[] := '{}';
begin
  if member is null then return jsonb_build_object('error','signin'); end if;
  if p_action = 'check_in' then
    changed := exm_member.add_award(member,'check_in','check-in:' || (now() at time zone 'UTC')::date::text);
    return exm_member.progress(member,true) || jsonb_build_object('awarded',changed);
  elsif p_action in ('redeem','equip','unequip') then
    perform id from exm_member.profiles where id = member for update;
    select * into reward from exm_member.rewards where slug = p_payload->>'reward' for share;
    if not found then return jsonb_build_object('error','missing'); end if;
    if p_action = 'redeem' then
      if not reward.active or reward.cost is null then return jsonb_build_object('error','unavailable'); end if;
      if exists(select 1 from exm_member.inventory where profile_id=member and inventory.reward=reward.slug) then
        return jsonb_build_object('error','owned');
      end if;
      if exm_member.wallet(member)<reward.cost then return jsonb_build_object('error','balance'); end if;
      insert into exm_member.inventory(profile_id,reward) values(member,reward.slug);
      insert into exm_member.ledger(profile_id,event_key,activity,xp,points)
        values(member,'reward:'||reward.slug,'redeem',0,-reward.cost);
    elsif not exists(select 1 from exm_member.inventory where profile_id=member and inventory.reward=reward.slug) then
      return jsonb_build_object('error','unowned');
    elsif p_action = 'equip' then
      insert into exm_member.equipped(profile_id,kind,reward) values(member,reward.kind,reward.slug)
      on conflict(profile_id,kind) do update set reward=excluded.reward;
    else
      delete from exm_member.equipped where profile_id=member and equipped.reward=reward.slug;
    end if;
    return jsonb_build_object('ok',true,'points',exm_member.wallet(member));
  elsif p_action in ('post','like','report') then
    item := (p_payload->>'id')::uuid;
    if p_action = 'post' then
      if not exists(select 1 from exm_member.profiles where id=member and discoverable) then
        return jsonb_build_object('error','discoverable');
      end if;
      parent := (p_payload->>'parent')::uuid;
      if parent is not null and not exists(
        select 1 from exm_member.community_items i join exm_member.profiles p on p.id=i.member_id and p.discoverable
        where i.id=parent and i.parent_id is null and not i.hidden
      ) then return jsonb_build_object('error','missing'); end if;
      insert into exm_member.community_items(id,member_id,parent_id,body)
        values(item,member,parent,p_payload->>'body') on conflict(id) do nothing;
    else
      if not exists (
        select 1 from exm_member.community_items i join exm_member.profiles p on p.id=i.member_id and p.discoverable
        where i.id=item and not i.hidden and (i.parent_id is null or exists(
          select 1 from exm_member.community_items top join exm_member.profiles author on author.id=top.member_id
          where top.id=i.parent_id and not top.hidden and author.discoverable))
      ) then return jsonb_build_object('error','missing'); end if;
      if p_action = 'report' then
        insert into exm_member.community_reports(item_id,member_id,reason)
          values(item,member,p_payload->>'reason') on conflict(item_id,member_id) do nothing;
      elsif (p_payload->>'liked')::boolean then
        insert into exm_member.community_likes(item_id,member_id) values(item,member) on conflict do nothing;
      else
        delete from exm_member.community_likes where item_id=item and member_id=member;
      end if;
    end if;
  elsif p_action = 'moderate' then
    if not exm_member.allowed(member,array['moderator']) then return jsonb_build_object('error','forbidden'); end if;
    item := (p_payload->>'id')::uuid;
    selected := p_payload->>'decision';
    update exm_member.community_reports set resolved_at=now() where item_id=item and resolved_at is null;
    if not found then return jsonb_build_object('error','missing'); end if;
    if selected='hide' then update exm_member.community_items set hidden=true where id=item; end if;
    insert into exm_member.audit(actor_id,action,subject)
      values(member,'moderation_'||selected,item::text);
  elsif p_action in ('award','rule','role','catalog','season','point_adjust') then
    if not exm_member.allowed(member,'{}') then return jsonb_build_object('error','forbidden'); end if;
    selected := p_payload->>'activity';
    if p_action in ('award','role','point_adjust') then
      select id into subject from exm_member.profiles where username = p_payload->>'username';
      if subject is null then return jsonb_build_object('error','missing'); end if;
      if subject=member then return jsonb_build_object('error','self'); end if;
    end if;
    if p_action = 'award' then
      category := p_payload->>'category';
      if category is not null and category <> 'overall' then groups := array[category]; end if;
      if selected in ('songwars_participation','battle_win','finals','championship') and not groups @> array['songwars'] then
        groups := array_append(groups,'songwars');
      end if;
      if selected = 'judging' and not groups @> array['judge'] then groups := array_append(groups,'judge'); end if;
      changed := exm_member.add_award(subject,selected,'verified:'||selected||':'||(p_payload->>'source'),groups);
      if not changed then return jsonb_build_object('error','duplicate'); end if;
      if selected = 'championship' then
        insert into exm_member.inventory(profile_id,reward) values(subject,'champion-badge') on conflict do nothing;
      end if;
    elsif p_action = 'point_adjust' then
      selected := p_payload->>'source';
      amount := (p_payload->>'points')::integer;
      perform id from exm_member.profiles where id = subject for update;
      if exm_member.wallet(subject) + amount < 0 then return jsonb_build_object('error','balance'); end if;
      insert into exm_member.ledger (profile_id,event_key,activity,xp,points)
        values (subject,'correction:'||selected,'reverse',0,amount)
        on conflict (profile_id,event_key) do nothing;
      if not found then return jsonb_build_object('error','duplicate'); end if;
    elsif p_action = 'rule' then
      update exm_member.award_rules set xp=(p_payload->>'xp')::integer,points=(p_payload->>'points')::integer
      where activity=selected;
      if not found then return jsonb_build_object('error','missing'); end if;
    elsif p_action = 'role' then
      selected := p_payload->>'role';
      if (p_payload->>'enabled')::boolean then
        insert into exm_member.staff(profile_id,role) values(subject,selected) on conflict do nothing;
      else
        delete from exm_member.staff where profile_id=subject and role=selected;
      end if;
    elsif p_action = 'catalog' then
      selected := p_payload->>'reward';
      update exm_member.rewards set active=(p_payload->>'active')::boolean,
        cost=case when cost is null then null else (p_payload->>'cost')::integer end where slug=selected;
      if not found then return jsonb_build_object('error','missing'); end if;
    else
      selected := p_payload->>'key';
      update exm_member.platform_settings set season_key=selected,season_name=p_payload->>'name';
    end if;
    insert into exm_member.audit(actor_id,action,subject,detail)
      values(member,p_action,coalesce(subject::text,selected),p_payload);
  else
    return jsonb_build_object('error','missing');
  end if;
  return jsonb_build_object('ok',true);
end;
$$;

revoke all on function public.exm_member_platform_read(text,text,jsonb),
  public.exm_member_platform_write(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.exm_member_platform_read(text,text,jsonb),
  public.exm_member_platform_write(text,text,jsonb) to service_role;
revoke all on function exm_member.actor(text),exm_member.allowed(uuid,text[]),exm_member.wallet(uuid),
  exm_member.add_award(uuid,text,text,text[]),exm_member.award_completed_profile(),
  exm_member.active_streak(uuid),exm_member.progress(uuid,boolean) from public,anon,authenticated;
grant execute on function exm_member.actor(text),exm_member.allowed(uuid,text[]),exm_member.wallet(uuid),
  exm_member.add_award(uuid,text,text,text[]),exm_member.active_streak(uuid),
  exm_member.progress(uuid,boolean) to service_role;
