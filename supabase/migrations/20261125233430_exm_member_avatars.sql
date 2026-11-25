-- One bounded, optimized file per existing EXM account. No separate storage service.
alter table exm_member.profiles drop constraint profiles_avatar_check;
alter table exm_member.profiles add constraint profiles_avatar_check check (avatar in ('initials','chrome','custom'));

create table exm_member.profile_avatars (
  profile_id uuid primary key references exm_member.profiles(id) on delete cascade,
  image bytea not null check (octet_length(image) between 24 and 49152)
);
alter table exm_member.profile_avatars enable row level security;
revoke all on exm_member.profile_avatars from public, anon, authenticated;
grant select,insert,update on exm_member.profile_avatars to service_role;

create function public.exm_member_avatar_read(p_token text,p_username text)
returns text language sql stable security invoker set search_path = ''
as $$
  select encode(a.image,'base64') from exm_member.profile_avatars a
  join exm_member.profiles p on p.id=a.profile_id
  where p.username=p_username and p.avatar='custom'
    and (p.discoverable or p.id=exm_member.actor(p_token))
$$;

create function public.exm_member_save_profile(p_token text,p_name text,p_bio text,p_visible boolean,
  p_roles text[],p_avatar text,p_links jsonb,p_image text)
returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare who uuid := exm_member.actor(p_token);
declare before_bio text;
declare has_image boolean;
declare granted text[] := '{}';
begin
  if who is null then return null; end if;
  select bio into before_bio from exm_member.profiles where id=who for update;
  select exists(select 1 from exm_member.profile_avatars where profile_id=who) into has_image;
  if p_avatar='custom' and p_image is null and not has_image then
    return jsonb_build_object('error','image_missing');
  end if;
  if p_image is not null then
    insert into exm_member.profile_avatars(profile_id,image) values(who,decode(p_image,'base64'))
      on conflict(profile_id) do update set image=excluded.image;
  end if;
  if not public.exm_member_identity(p_token,p_name,p_bio,p_visible,p_roles,p_avatar,p_links) then return null; end if;
  if btrim(before_bio)='' and btrim(p_bio)<>'' and exm_member.add_award(who,'first_bio','first-bio') then
    granted := array_append(granted,'first_bio');
  end if;
  if p_image is not null and not has_image and exm_member.add_award(who,'first_avatar','first-avatar') then
    granted := array_append(granted,'first_avatar');
  end if;
  return jsonb_build_object('saved',true,'awards',granted,'progress',exm_member.progress(who,true));
end;
$$;

revoke all on function public.exm_member_avatar_read(text,text),
  public.exm_member_save_profile(text,text,text,boolean,text[],text,jsonb,text) from public,anon,authenticated;
grant execute on function public.exm_member_avatar_read(text,text),
  public.exm_member_save_profile(text,text,text,boolean,text[],text,jsonb,text) to service_role;
