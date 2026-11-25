-- Preview-only competition records for new local events. Real SongWars results
-- and applicant operations remain with the existing registration/archives.
create table exm_member.event_matches (
  id uuid primary key,
  event_id uuid not null references exm_member.events(id),
  draft jsonb not null,
  published jsonb,
  recorded_by uuid not null references exm_member.profiles(id),
  updated_at timestamptz not null default now()
);
create index exm_event_matches_idx on exm_member.event_matches(event_id,updated_at);
alter table exm_member.event_matches enable row level security;
grant select,insert,update on exm_member.event_matches to service_role;

create function exm_member.can_score(member uuid,event uuid) returns boolean
language sql stable set search_path = ''
as $$
  select exm_member.allowed(member,'{}') or
    (exm_member.allowed(member,array['judge']) and exists(select 1 from exm_member.event_staff
      where event_id=event and member_id=member and role='judge'))
$$;

create function public.exm_member_competition_read(p_token text,p_view text,p_options jsonb default '{}') returns jsonb
language plpgsql stable set search_path = ''
as $$
declare member uuid := exm_member.actor(p_token);
declare event uuid := (p_options->>'id')::uuid;
declare result jsonb;
begin
  if p_view='match_drafts' then
    if member is null then return jsonb_build_object('error','signin'); end if;
    if not exm_member.can_score(member,event) then return jsonb_build_object('error','forbidden'); end if;
    select coalesce(jsonb_agg(to_jsonb(m) order by updated_at,id),'[]') into result from (
      select id,draft,published,updated_at from exm_member.event_matches where event_id=event order by updated_at,id limit 40
    ) m;
  else
    select coalesce(jsonb_agg(m.published || jsonb_build_object('id', m.id)
      order by (m.published->>'position')::integer,m.id),'[]') into result
    from (
      select x.id,x.published from exm_member.event_matches x join exm_member.events e on e.id=x.event_id
      where x.published is not null and e.published is not null and e.published->>'status'<>'archived'
        and (p_view='matches' and e.id=event or p_view='preview_champions'
          and e.published->>'status'='completed' and x.published->>'championship'='true')
      order by x.updated_at desc,x.id limit 40
    ) m;
  end if;
  return jsonb_build_object('items',result);
end;
$$;

create function public.exm_member_competition_write(p_token text,p_action text,p_payload jsonb default '{}') returns jsonb
language plpgsql set search_path = ''
as $$
declare member uuid := exm_member.actor(p_token);
declare event uuid := (p_payload->>'event')::uuid;
declare match_id uuid := (p_payload->>'id')::uuid;
begin
  if member is null then return jsonb_build_object('error','signin'); end if;
  if p_action='match_save' then
    if not exm_member.can_score(member,event) then return jsonb_build_object('error','forbidden'); end if;
    if not exists(select 1 from exm_member.events where id=event) then return jsonb_build_object('error','missing'); end if;
    insert into exm_member.event_matches(id,event_id,draft,recorded_by)
      values(match_id,event,p_payload-'id'-'event',member)
      on conflict(id) do update set draft=excluded.draft,recorded_by=member,updated_at=now()
        where event_matches.event_id=event;
  elsif p_action='match_publish' then
    if not exm_member.allowed(member,'{}') then return jsonb_build_object('error','forbidden'); end if;
    if not exists(select 1 from exm_member.events where id=event and published is not null
      and published->>'status' in ('live','completed')) then
      return jsonb_build_object('error','closed');
    end if;
    update exm_member.event_matches set published=draft,updated_at=now() where id=match_id and event_id=event;
  else
    return jsonb_build_object('error','missing');
  end if;
  if not found then return jsonb_build_object('error','missing'); end if;
  insert into exm_member.audit(actor_id,action,subject,detail)
    values(member,p_action,match_id::text,jsonb_build_object('event',event));
  return jsonb_build_object('ok',true);
end;
$$;

revoke all on function public.exm_member_competition_read(text,text,jsonb),
  public.exm_member_competition_write(text,text,jsonb),exm_member.can_score(uuid,uuid) from public,anon,authenticated;
grant execute on function public.exm_member_competition_read(text,text,jsonb),
  public.exm_member_competition_write(text,text,jsonb),exm_member.can_score(uuid,uuid) to service_role;
