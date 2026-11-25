-- Password-only sessions must never bypass an MFA factor on the shared Auth account.
create function exm_member.needs_mfa(p_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from auth.mfa_factors where user_id = p_id and status = 'verified');
$$;
revoke all on function exm_member.needs_mfa(uuid) from public, anon, authenticated;
grant execute on function exm_member.needs_mfa(uuid) to service_role;

create or replace function public.exm_member_open_hosted_session(p_id uuid, p_token text)
returns boolean language plpgsql security invoker set search_path = ''
as $$
begin
  if not exists (select 1 from exm_member.profiles where id = p_id) or exm_member.needs_mfa(p_id) then
    return null;
  end if;
  insert into exm_member.sessions (token_hash, profile_id, expires_at)
    values (p_token, p_id, now() + interval '1 day');
  return false;
end;
$$;
