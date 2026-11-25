-- Service-only operations for the new member platform. Legacy SongWars forms,
-- account gates, registration data and archived results stay external.
create table exm_member.access_scopes (
  slug text primary key,
  title text not null,
  body text not null
);

create table exm_member.legacy_identities (
  slug text primary key check (slug ~ '^[a-z0-9-]{4,45}$'),
  name text not null check (length(name) between 1 and 80),
  profile_id uuid unique references exm_member.profiles(id),
  verified_by uuid not null references exm_member.profiles(id),
  claimed_at timestamptz
);

create table exm_member.access_tokens (
  token_hash text primary key check (token_hash ~ '^[a-f0-9]{64}$'),
  scope text references exm_member.access_scopes(slug),
  legacy_slug text references exm_member.legacy_identities(slug),
  recipient uuid references exm_member.profiles(id),
  issuer uuid not null references exm_member.profiles(id),
  expires_at timestamptz not null,
  used_at timestamptz,
  check ((scope is not null and legacy_slug is null)
    or (scope is null and legacy_slug is not null and recipient is not null))
);
create table exm_member.access_grants (
  scope text not null references exm_member.access_scopes(slug),
  profile_id uuid not null references exm_member.profiles(id),
  granted_at timestamptz not null default now(),
  primary key (scope,profile_id)
);

create table exm_member.events (
  id uuid primary key,
  kind text not null check (kind in ('gaming','community','stream','residency','screening','in_person','other')),
  status text not null check(status in ('draft','scheduled','registration_open','live','completed','canceled','archived')),
  draft jsonb not null,
  published jsonb,
  created_by uuid not null references exm_member.profiles(id),
  updated_at timestamptz not null default now()
);
create index exm_events_updated_idx on exm_member.events(updated_at desc);
create table exm_member.event_staff (
  event_id uuid references exm_member.events(id),
  member_id uuid references exm_member.profiles(id),
  role text not null check(role in ('event_staff','judge')),
  primary key(event_id,member_id,role)
);
create table exm_member.event_applications (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references exm_member.events(id),
  member_id uuid references exm_member.profiles(id),
  contact text not null check (length(contact)<=254),
  display_name text not null check (length(display_name) between 1 and 80),
  answer text not null check (length(answer)<=600),
  status text not null default 'pending' check(status in ('pending','approved','waitlisted','declined')),
  created_at timestamptz not null default now(),
  unique(event_id,contact)
);
create index exm_applications_status_idx on exm_member.event_applications(event_id,status,created_at);

create table exm_member.notices (
  id uuid primary key,
  draft jsonb not null,
  published jsonb,
  archived boolean not null default false,
  updated_at timestamptz not null default now()
);
create index exm_notices_updated_idx on exm_member.notices(updated_at desc);
alter table exm_member.recovery_cases add column reviewed_at timestamptz;

alter table exm_member.access_scopes enable row level security;
alter table exm_member.legacy_identities enable row level security;
alter table exm_member.access_tokens enable row level security;
alter table exm_member.access_grants enable row level security;
alter table exm_member.events enable row level security;
alter table exm_member.event_staff enable row level security;
alter table exm_member.event_applications enable row level security;
alter table exm_member.notices enable row level security;

grant select on exm_member.access_scopes to service_role;
grant select,insert,update on exm_member.access_tokens, exm_member.legacy_identities,
  exm_member.events, exm_member.event_applications, exm_member.notices to service_role;
grant select,insert on exm_member.access_grants,exm_member.event_staff to service_role;
grant update(reviewed_at) on exm_member.recovery_cases to service_role;

create function exm_member.can_review(member uuid,event uuid) returns boolean
language sql stable set search_path = ''
as $$
  select exm_member.allowed(member,'{}') or
  (exm_member.allowed(member,array['event_staff']) and exists (
    select 1 from exm_member.event_staff where event_id=event and member_id=member and role='event_staff'
  ))
$$;

create function public.exm_member_operations_read(p_token text,p_view text,p_options jsonb default '{}') returns jsonb
language plpgsql stable set search_path = ''
as $$
declare member uuid := exm_member.actor(p_token);
declare target_scope text := p_options->>'scope';
declare event uuid;
begin
  if p_view = 'events' then
    return jsonb_build_object('items',coalesce((select jsonb_agg(public_card order by updated_at desc) from (
      select published || jsonb_build_object('id',id) as public_card,updated_at
      from exm_member.events where published is not null and published->>'status' <> 'archived'
      order by updated_at desc limit 20
    ) e),'[]'));
  elsif p_view = 'notices' then
    return jsonb_build_object('items',coalesce((select jsonb_agg(published || jsonb_build_object('id',id) order by pinned desc,updated_at desc) from (
      select n.*,coalesce((published->>'pinned')::boolean,false) as pinned
      from exm_member.notices n where not archived and published is not null
        and (published->>'publishAt' is null or (published->>'publishAt')::timestamptz <= now())
        and (published->>'expiresAt' is null or (published->>'expiresAt')::timestamptz > now())
      order by pinned desc,updated_at desc limit 20
    ) n),'[]'));
  end if;
  if member is null then return jsonb_build_object('error','signin'); end if;
  if p_view = 'access' then
    return jsonb_build_object('scopes',coalesce((select jsonb_agg(jsonb_build_object(
      'slug',s.slug,'title',s.title,'granted',g.profile_id is not null
    ) order by s.slug) from exm_member.access_scopes s left join exm_member.access_grants g
       on g.scope=s.slug and g.profile_id=member),'[]'),
    'legacy',(select name from exm_member.legacy_identities where profile_id=member));
  elsif p_view = 'protected' then
    if not exists(select 1 from exm_member.access_grants g where g.scope = target_scope and profile_id=member) then
      return jsonb_build_object('error','locked');
    end if;
    return (select jsonb_build_object('title',s.title,'body',s.body) from exm_member.access_scopes s where s.slug=target_scope);
  elsif p_view = 'applications' then
    event := (p_options->>'id')::uuid;
    if not exm_member.can_review(member,event) then return jsonb_build_object('error','forbidden'); end if;
    return jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(a) order by created_at,id) from (
      select id,display_name,contact,answer,status,created_at from exm_member.event_applications
      where event_id=event order by created_at,id limit 100
    ) a),'[]'));
  elsif p_view = 'studio' then
    if not exm_member.allowed(member,array['event_staff','judge']) then return jsonb_build_object('error','forbidden'); end if;
    return jsonb_build_object(
      'events',coalesce((select jsonb_agg(to_jsonb(e) order by updated_at desc) from (
        select e.id,e.kind,e.status,e.draft,e.published,e.updated_at
        from exm_member.events e
        where exm_member.can_review(member,e.id) or (exm_member.allowed(member,array['judge']) and exists (
          select 1 from exm_member.event_staff f where f.event_id=e.id and f.member_id=member and f.role='judge'))
        order by e.updated_at desc limit 30
      ) e),'[]'),
      'notices',case when exm_member.allowed(member,'{}') then coalesce((select jsonb_agg(to_jsonb(n) order by updated_at desc) from (
        select id,draft,published,archived,updated_at from exm_member.notices order by updated_at desc limit 30
      ) n),'[]') else '[]'::jsonb end,
      'legacy',case when exm_member.allowed(member,'{}') then coalesce((select jsonb_agg(jsonb_build_object(
        'slug',slug,'name',name,'claimed',profile_id is not null)) from exm_member.legacy_identities),'[]') else '[]'::jsonb end,
      'recovery',case when exm_member.allowed(member,'{}') then coalesce((select jsonb_agg(to_jsonb(c)) from (
        select r.reference,p.username,r.created_at from exm_member.recovery_cases r
        join exm_member.profiles p on p.id=r.profile_id
        where r.reviewed_at is null and r.created_at > now()-interval '7 days' order by r.created_at limit 25
      ) c),'[]') else '[]'::jsonb end
    );
  end if;
  return jsonb_build_object('error','missing');
end;
$$;

create function public.exm_member_operations_write(p_token text,p_action text,p_payload jsonb default '{}') returns jsonb
language plpgsql set search_path = ''
as $$
declare member uuid := exm_member.actor(p_token);
declare subject uuid;
declare event uuid := (p_payload->>'event')::uuid;
declare id_value uuid := (p_payload->>'id')::uuid;
declare gate exm_member.access_tokens;
declare event_data exm_member.events;
declare selected text := p_payload->>'scope';
declare legacy text := p_payload->>'legacy';
declare next_status text := p_payload->>'status';
declare old_status text;
declare limit_value integer;
declare subject_label text;
begin
  if p_action = 'apply' then
    select * into event_data from exm_member.events where id=event for update;
    if not found or event_data.published->>'status' is distinct from 'registration_open'
      or (event_data.published->>'opensAt' is not null and (event_data.published->>'opensAt')::timestamptz > now())
      or (event_data.published->>'closesAt' is not null and (event_data.published->>'closesAt')::timestamptz <= now()) then
      return jsonb_build_object('error','closed');
    end if;
    if event_data.published->>'question' is not null and length(btrim(coalesce(p_payload->>'answer',''))) = 0 then
      return jsonb_build_object('error','answer');
    end if;
    insert into exm_member.event_applications(event_id,member_id,contact,display_name,answer)
      values(event,member,p_payload->>'contact',p_payload->>'name',p_payload->>'answer')
      on conflict(event_id,contact) do nothing;
    return jsonb_build_object('ok',true);
  end if;
  if member is null then return jsonb_build_object('error','signin'); end if;
  if p_action = 'claim' or p_action = 'unlock' then
    select * into gate from exm_member.access_tokens t where t.token_hash=p_payload->>'hash'
      and t.used_at is null and t.expires_at > now() for update;
    if not found or (gate.recipient is not null and gate.recipient <> member)
        or (p_action='unlock' and gate.scope is distinct from selected)
        or (p_action='claim' and gate.legacy_slug is distinct from legacy) then
      return jsonb_build_object('error','invalid_code');
    end if;
    if p_action='unlock' then
      insert into exm_member.access_grants(scope,profile_id) values(selected,member) on conflict do nothing;
      if not found then return jsonb_build_object('error','invalid_code'); end if;
      subject_label := selected;
    else
      perform id from exm_member.profiles where id=member for update;
      if exists(select 1 from exm_member.legacy_identities where profile_id=member) then
        return jsonb_build_object('error','invalid_code');
      end if;
      update exm_member.legacy_identities set profile_id=member,claimed_at=now()
        where slug=legacy and profile_id is null;
      if not found then return jsonb_build_object('error','invalid_code'); end if;
      subject_label := legacy;
    end if;
    update exm_member.access_tokens set used_at=now() where token_hash=gate.token_hash;
  elsif p_action = 'application_review' then
    if not exm_member.can_review(member,event) then return jsonb_build_object('error','forbidden'); end if;
    select * into event_data from exm_member.events where id=event for update;
    if not found then return jsonb_build_object('error','missing'); end if;
    select status into old_status from exm_member.event_applications where id=id_value and event_id=event for update;
    if not found then return jsonb_build_object('error','missing'); end if;
    limit_value := (event_data.published->>'capacity')::integer;
    if next_status = 'approved' and old_status <> 'approved' and limit_value is not null and
        (select count(*) from exm_member.event_applications where event_id=event and status='approved') >= limit_value then
      return jsonb_build_object('error','capacity');
    end if;
    update exm_member.event_applications set status=next_status where id=id_value;
    subject_label := id_value::text;
  else
    if not exm_member.allowed(member,'{}') then return jsonb_build_object('error','forbidden'); end if;
    if p_action in ('issue_access','issue_claim','event_assign') and p_payload ? 'username' then
      select id into subject from exm_member.profiles where username=p_payload->>'username';
      if subject is null then return jsonb_build_object('error','missing'); end if;
    end if;
    if p_action = 'issue_access' then
      if not exists(select 1 from exm_member.access_scopes where slug=selected) then
        return jsonb_build_object('error','missing');
      end if;
      insert into exm_member.access_tokens(token_hash,scope,recipient,issuer,expires_at)
        values (p_payload->>'hash',selected,subject,member,now()+interval '24 hours');
      subject_label := selected;
    elsif p_action = 'legacy_reserve' then
      insert into exm_member.legacy_identities(slug,name,verified_by)
        values(legacy,p_payload->>'name',member) on conflict do nothing;
      if not found then return jsonb_build_object('error','duplicate'); end if;
      subject_label := legacy;
    elsif p_action = 'issue_claim' then
      if not exists(select 1 from exm_member.legacy_identities where slug=legacy and profile_id is null) then
        return jsonb_build_object('error','missing');
      end if;
      insert into exm_member.access_tokens(token_hash,legacy_slug,recipient,issuer,expires_at)
        values (p_payload->>'hash',legacy,subject,member,now()+interval '24 hours');
      subject_label := legacy;
    elsif p_action = 'event_save' then
      insert into exm_member.events(id,kind,status,draft,created_by)
        values(id_value,p_payload->>'kind',next_status,p_payload-'id',member)
        on conflict(id) do update set kind=excluded.kind,status=excluded.status,draft=excluded.draft,updated_at=now();
      subject_label := id_value::text;
    elsif p_action = 'event_publish' then
      update exm_member.events set published=draft,updated_at=now() where id=id_value and status <> 'draft';
      if not found then return jsonb_build_object('error','closed'); end if;
      subject_label := id_value::text;
    elsif p_action = 'event_assign' then
      if not exists(select 1 from exm_member.events where id=event)
        or not exists(select 1 from exm_member.staff where profile_id=subject and role=p_payload->>'role') then
        return jsonb_build_object('error','missing');
      end if;
      insert into exm_member.event_staff(event_id,member_id,role) values(event,subject,p_payload->>'role') on conflict do nothing;
      subject_label := event::text;
    elsif p_action = 'notice_save' then
      if event is not null and not exists(select 1 from exm_member.events where id=event and published is not null
        and published->>'status'<>'archived') then
        return jsonb_build_object('error','missing');
      end if;
      insert into exm_member.notices(id,draft) values (id_value,p_payload-'id')
        on conflict(id) do update set draft=excluded.draft,updated_at=now();
      subject_label := id_value::text;
    elsif p_action in ('notice_publish','notice_archive') then
      update exm_member.notices set published=case when p_action='notice_publish' then draft else published end,
        archived=p_action='notice_archive',updated_at=now() where id=id_value;
      if not found then return jsonb_build_object('error','missing'); end if;
      subject_label := id_value::text;
    elsif p_action = 'recovery_review' then
      update exm_member.recovery_cases set reviewed_at=now() where reference=id_value
        and reviewed_at is null and created_at>now()-interval '7 days';
      if not found then return jsonb_build_object('error','missing'); end if;
      subject_label := id_value::text;
    else
      return jsonb_build_object('error','missing');
    end if;
  end if;
  insert into exm_member.audit(actor_id,action,subject,detail)
    values(member,p_action,subject_label,
      case when p_action='application_review' then jsonb_build_object('status',next_status)
        when p_action='event_assign' then jsonb_build_object('role',p_payload->>'role','member',subject)
        else '{}'::jsonb end);
  return jsonb_build_object('ok',true);
end;
$$;

revoke all on function public.exm_member_operations_read(text,text,jsonb),
  public.exm_member_operations_write(text,text,jsonb),exm_member.can_review(uuid,uuid) from public,anon,authenticated;
grant execute on function public.exm_member_operations_read(text,text,jsonb),
  public.exm_member_operations_write(text,text,jsonb),exm_member.can_review(uuid,uuid) to service_role;
