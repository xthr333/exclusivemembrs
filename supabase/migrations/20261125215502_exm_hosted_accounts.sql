-- Existing provider identities enter EXM only after an explicit profile link.
-- Hosted sessions can stay open while the manual recovery procedure is reviewed.
alter table exm_member.profiles alter column discoverable set default false;

create function public.exm_member_open_hosted_session(p_id uuid, p_token text)
returns boolean language plpgsql security invoker set search_path = ''
as $$
begin
  if not exists (select 1 from exm_member.profiles where id = p_id) then
    return null;
  end if;
  insert into exm_member.sessions (token_hash, profile_id, expires_at)
    values (p_token, p_id, now() + interval '1 day');
  return false;
end;
$$;
revoke all on function public.exm_member_open_hosted_session(uuid,text) from public, anon, authenticated;
grant execute on function public.exm_member_open_hosted_session(uuid,text) to service_role;
