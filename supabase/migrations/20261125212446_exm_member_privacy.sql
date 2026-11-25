create table exm_member.blocks (
  blocker_id uuid not null references exm_member.profiles(id) on delete cascade,
  blocked_id uuid not null references exm_member.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id,blocked_id),
  check (blocker_id <> blocked_id)
);
create index exm_member_blocks_blocked_idx on exm_member.blocks(blocked_id, blocker_id);
alter table exm_member.blocks enable row level security;
grant select, insert, delete on exm_member.blocks to service_role;

create function exm_member.can_interact(first_member uuid, second_member uuid) returns boolean
language sql stable set search_path = ''
as $$
  select not exists(select 1 from exm_member.blocks b where
    (b.blocker_id=first_member and b.blocked_id=second_member)
    or (b.blocker_id=second_member and b.blocked_id=first_member))
$$;

-- A block and a concurrent follow share the same ordered pair lock.
create function exm_member.lock_members(member_ids uuid[]) returns void
language sql set search_path = ''
as $$
  select id from exm_member.profiles where id=any(member_ids) order by id for update
$$;

create function public.exm_member_block_list(p_token text, p_after text default '') returns jsonb
language plpgsql stable set search_path = ''
as $$
declare viewer uuid := exm_member.actor(p_token);
declare result jsonb;
begin
  if viewer is null then return jsonb_build_object('error','signin'); end if;
  select coalesce(jsonb_agg(username order by username),'[]') into result from (
    select p.username from exm_member.blocks b join exm_member.profiles p on p.id=b.blocked_id
    where b.blocker_id=viewer and p.username>p_after order by p.username limit 51
  ) blocked;
  return jsonb_build_object('members',case when jsonb_array_length(result)>50 then result-50 else result end,
    'nextAfter',case when jsonb_array_length(result)>50 then result->>49 else null end);
end;
$$;

create function public.exm_member_set_block(p_token text, p_username text, p_block boolean) returns jsonb
language plpgsql set search_path = ''
as $$
declare viewer uuid := exm_member.actor(p_token);
declare subject uuid;
begin
  if viewer is null then return jsonb_build_object('error','signin'); end if;
  select id into subject from exm_member.profiles where username=p_username;
  if subject is null or subject=viewer then return jsonb_build_object('error','missing'); end if;
  perform exm_member.lock_members(array[viewer,subject]);
  if p_block then
    if not exists(select 1 from exm_member.profiles where id=subject and discoverable) then
      return jsonb_build_object('error','missing');
    end if;
    insert into exm_member.blocks(blocker_id,blocked_id) values(viewer,subject) on conflict do nothing;
    delete from exm_member.follows where (follower_id=viewer and followed_id=subject)
      or (follower_id=subject and followed_id=viewer);
  else
    delete from exm_member.blocks where blocker_id=viewer and blocked_id=subject;
  end if;
  return jsonb_build_object('ok',true,'blocked',p_block);
end;
$$;

alter function public.exm_member_set_follow(text,text,boolean) rename to exm_member_set_follow_base;
create function public.exm_member_set_follow(p_token text, p_username text, p_follow boolean) returns boolean
language plpgsql set search_path = ''
as $$
declare viewer uuid := exm_member.actor(p_token);
declare subject uuid;
begin
  if viewer is null then return null; end if;
  select id into subject from exm_member.profiles where username=p_username and discoverable;
  if subject is null or subject=viewer then return false; end if;
  perform exm_member.lock_members(array[viewer,subject]);
  if not exm_member.can_interact(viewer,subject) then return false; end if;
  return public.exm_member_set_follow_base(p_token,p_username,p_follow);
end;
$$;

alter function public.exm_member_public_profile(text,text) rename to exm_member_public_profile_base;
create function public.exm_member_public_profile(p_username text, p_viewer text) returns jsonb
language plpgsql stable set search_path = ''
as $$
declare viewer uuid := exm_member.actor(p_viewer);
declare subject uuid;
declare profile jsonb;
begin
  profile := public.exm_member_public_profile_base(p_username,p_viewer);
  if profile is null then return null; end if;
  select id into subject from exm_member.profiles where username=p_username;
  return profile || jsonb_build_object(
    'canFollow',(profile->>'canFollow')::boolean and exm_member.can_interact(viewer,subject),
    'canBlock',viewer is not null and viewer<>subject,
    'blockedByViewer',exists(select 1 from exm_member.blocks where blocker_id=viewer and blocked_id=subject)
  );
end;
$$;

create function public.exm_member_feed_visible(p_token text,p_before timestamptz default null,p_before_id uuid default null)
returns jsonb language plpgsql stable set search_path = ''
as $$
declare viewer uuid := exm_member.actor(p_token);
declare result jsonb;
begin
  if viewer is null then return jsonb_build_object('error','signin'); end if;
  select coalesce(jsonb_agg(to_jsonb(post) order by created_at desc,id desc),'[]') into result from (
    select i.id,p.username,p.display_name,i.body,i.created_at,
      (select count(*) from exm_member.community_likes likes
        where likes.item_id=i.id and exm_member.can_interact(viewer,likes.member_id)) as likes,
      exists(select 1 from exm_member.community_likes where item_id=i.id and member_id=viewer) as liked,
      coalesce((select jsonb_agg(to_jsonb(comment) order by created_at,id) from (
        select c.id,a.username,a.display_name,c.body,c.created_at
        from exm_member.community_items c join exm_member.profiles a on a.id=c.member_id and a.discoverable
        where c.parent_id=i.id and not c.hidden and exm_member.can_interact(viewer,c.member_id)
        order by c.created_at desc,c.id desc limit 20
      ) comment),'[]') as comments
    from exm_member.community_items i join exm_member.profiles p on p.id=i.member_id and p.discoverable
    where i.parent_id is null and not i.hidden and exm_member.can_interact(viewer,i.member_id)
      and (p_before is null or i.created_at<p_before or
        (p_before_id is not null and i.created_at=p_before and i.id<p_before_id))
    order by i.created_at desc,i.id desc limit 21
  ) post;
  return jsonb_build_object('items',case when jsonb_array_length(result)>20 then result-20 else result end,
    'hasMore',jsonb_array_length(result)>20);
end;
$$;

create function public.exm_member_interaction_write(p_token text,p_action text,p_payload jsonb) returns jsonb
language plpgsql set search_path = ''
as $$
declare viewer uuid := exm_member.actor(p_token);
declare item_id uuid;
declare author uuid;
declare parent_author uuid;
begin
  if viewer is null then return jsonb_build_object('error','signin'); end if;
  if p_action not in ('post','like','report') then return jsonb_build_object('error','missing'); end if;
  item_id := (p_payload->>(case when p_action='post' then 'parent' else 'id' end))::uuid;
  if item_id is not null then
    select i.member_id,parent.member_id into author,parent_author from exm_member.community_items i
      left join exm_member.community_items parent on parent.id=i.parent_id where i.id=item_id;
    if not found then return jsonb_build_object('error','missing'); end if;
    perform exm_member.lock_members(array[viewer,author,parent_author]);
    if not exm_member.can_interact(viewer,author) or not exm_member.can_interact(viewer,parent_author) then
      return jsonb_build_object('error','missing');
    end if;
  end if;
  return public.exm_member_platform_write(p_token,p_action,p_payload);
end;
$$;

revoke all on function exm_member.can_interact(uuid,uuid),exm_member.lock_members(uuid[]),
  public.exm_member_block_list(text,text),public.exm_member_set_block(text,text,boolean),
  public.exm_member_set_follow(text,text,boolean),public.exm_member_public_profile(text,text),
  public.exm_member_feed_visible(text,timestamptz,uuid),public.exm_member_interaction_write(text,text,jsonb) from public,anon,authenticated;
grant execute on function exm_member.can_interact(uuid,uuid),exm_member.lock_members(uuid[]),
  public.exm_member_block_list(text,text),public.exm_member_set_block(text,text,boolean),
  public.exm_member_set_follow(text,text,boolean),public.exm_member_public_profile(text,text),
  public.exm_member_feed_visible(text,timestamptz,uuid),public.exm_member_interaction_write(text,text,jsonb) to service_role;
