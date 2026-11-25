-- Owner-controlled curation for the integrated preview. Approved static content
-- remains usable on the public site whenever this service is unavailable.
create table exm_member.editorial_creators (
  slug text primary key,
  name text not null
);
-- Existing shareable EXM pages only. These are editorial links, not login IDs.
insert into exm_member.editorial_creators values
  ('mayo','Mayo_'), ('bitchyounotayop','BitchYouNotAYop'), ('vantiva','Vantiva');
create table exm_member.editorial (
  singleton boolean primary key default true check (singleton),
  revision integer not null default 0,
  draft jsonb not null default '{}',
  published_revision integer not null default 0,
  published jsonb not null default '{}'
);
insert into exm_member.editorial default values;

alter table exm_member.editorial_creators enable row level security;
alter table exm_member.editorial enable row level security;
grant select on exm_member.editorial_creators to service_role;
grant select, update on exm_member.editorial to service_role;

create function public.exm_member_editorial_read(p_token text, p_view text, p_options jsonb default '{}') returns jsonb
language plpgsql stable set search_path = ''
as $$
declare
  member uuid := exm_member.actor(p_token);
  current_edit exm_member.editorial;
begin
  select * into current_edit from exm_member.editorial;
  if p_view='featured_content' then
    return jsonb_build_object(
      'campaign',(select jsonb_build_object(
        'id',id,'name',published->>'name','description',published->>'description','status',published->>'status'
      ) from exm_member.events
      where id=(current_edit.published->>'event')::uuid and published->>'status' in ('scheduled','registration_open','live','completed')),
      'creator',(select jsonb_build_object(
        'slug',slug,'name',name,'description',current_edit.published->>'description'
      ) from exm_member.editorial_creators where slug=current_edit.published->>'creator')
    );
  end if;
  if member is null then return jsonb_build_object('error','signin'); end if;
  if not exm_member.allowed(member,'{}') then return jsonb_build_object('error','forbidden'); end if;
  if p_view <> 'campaign_studio' then return jsonb_build_object('error','missing'); end if;
  return jsonb_build_object(
    'revision',current_edit.revision,'publishedRevision',current_edit.published_revision,
    'draft',current_edit.draft,'published',current_edit.published,
    'events',coalesce((select jsonb_agg(to_jsonb(eligible) order by name,id) from (
      select id,published->>'name' as name from exm_member.events
      where published->>'status' in ('scheduled','registration_open','live','completed')
      order by updated_at desc limit 50
    ) eligible),'[]'),
    'creators',(select jsonb_agg(to_jsonb(c) order by name) from exm_member.editorial_creators c)
  );
end;
$$;

create function public.exm_member_editorial_write(p_token text, p_action text, p_payload jsonb default '{}') returns jsonb
language plpgsql set search_path = ''
as $$
declare
  member uuid := exm_member.actor(p_token);
  current_edit exm_member.editorial;
  chosen jsonb;
  event_id uuid;
  creator text;
begin
  if member is null then return jsonb_build_object('error','signin'); end if;
  if not exm_member.allowed(member,'{}') then return jsonb_build_object('error','forbidden'); end if;
  select * into current_edit from exm_member.editorial for update;
  if current_edit.revision is distinct from (p_payload->>'revision')::integer then
    return jsonb_build_object('error','stale');
  end if;
  if p_action='editorial_save' then
    chosen := p_payload-'revision';
  elsif p_action='editorial_publish' then
    chosen := current_edit.draft;
    if current_edit.published_revision=current_edit.revision then
      return jsonb_build_object('error','duplicate');
    end if;
  else
    return jsonb_build_object('error','missing');
  end if;
  event_id := (chosen->>'event')::uuid;
  creator := chosen->>'creator';
  if event_id is not null and not exists(select 1 from exm_member.events e
    where e.id=event_id and e.published->>'status' in ('scheduled','registration_open','live','completed')) then
    return jsonb_build_object('error','missing');
  end if;
  if creator is not null and not exists(select 1 from exm_member.editorial_creators c where c.slug=creator) then
    return jsonb_build_object('error','missing');
  end if;
  if p_action='editorial_save' then
    update exm_member.editorial set draft=chosen,revision=revision+1;
  else
    update exm_member.editorial set published=chosen,published_revision=revision;
  end if;
  insert into exm_member.audit(actor_id,action,subject,detail)
    values(member,p_action,'homepage',jsonb_build_object(
      'event',event_id,'creator',creator,'revision',current_edit.revision+case when p_action='editorial_save' then 1 else 0 end));
  return jsonb_build_object('ok',true);
end;
$$;

revoke all on function public.exm_member_editorial_read(text,text,jsonb),
  public.exm_member_editorial_write(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.exm_member_editorial_read(text,text,jsonb),
  public.exm_member_editorial_write(text,text,jsonb) to service_role;
