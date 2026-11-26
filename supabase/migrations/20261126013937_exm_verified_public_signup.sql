-- EXM owns age screening and provisioning. Supabase owns email and credentials.
-- This does not change provider-wide signup settings or existing accounts.
create function exm_member.public_signup_state(p_email text) returns text
language sql stable security definer set search_path = ''
as $$
  select coalesce((select case
    when u.raw_app_meta_data -> 'exm_registration_pending' = 'true'::jsonb
      and not exists(select 1 from exm_member.profiles p where p.id = u.id)
      and u.deleted_at is null
      then case when u.email_confirmed_at is null then 'unconfirmed' else 'confirmed' end
    else 'unavailable' end
  from auth.users u where lower(u.email) = p_email
  order by u.deleted_at nulls first, u.id limit 1), 'missing')
$$;
revoke all on function exm_member.public_signup_state(text) from public, anon, authenticated;
grant execute on function exm_member.public_signup_state(text) to service_role;

create function public.exm_member_public_signup_state(p_email text) returns text
language sql stable security invoker set search_path = ''
as $$
  select exm_member.public_signup_state(p_email)
$$;
revoke all on function public.exm_member_public_signup_state(text) from public, anon, authenticated;
grant execute on function public.exm_member_public_signup_state(text) to service_role;

-- Complete the password and profile setup in the Auth admin update transaction.
-- The old enrollment state is checked on the locked Auth row so two concurrent
-- attempts cannot change the password or reassign the profile after completion.
create function exm_member.provision_public_signup() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  handle text := new.raw_app_meta_data ->> 'exm_signup_handle';
  stage_name text := new.raw_app_meta_data ->> 'exm_signup_name';
begin
  if handle is null then return new; end if;
  if old.raw_app_meta_data -> 'exm_registration_pending' is distinct from 'true'::jsonb
    or new.raw_app_meta_data -> 'exm_registration_pending' is distinct from 'false'::jsonb
    or old.email_confirmed_at is null or old.deleted_at is not null or old.is_anonymous
    or handle !~ '^[a-z0-9][a-z0-9_-]{2,23}$'
    or stage_name is null or length(stage_name) not between 1 and 60
    or exists(select 1 from exm_member.reserved_handles where username = handle)
  then
    raise exception 'Member signup or handle unavailable';
  end if;

  insert into exm_member.profiles (id, username, display_name, discoverable)
    values (new.id, handle, stage_name, false);
  new.raw_app_meta_data := new.raw_app_meta_data - 'exm_signup_handle' - 'exm_signup_name';
  return new;
end;
$$;
revoke all on function exm_member.provision_public_signup() from public, anon, authenticated;
create trigger exm_member_finish_public_signup before update of raw_app_meta_data on auth.users
  for each row execute function exm_member.provision_public_signup();
