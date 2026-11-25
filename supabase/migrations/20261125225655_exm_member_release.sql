-- Issue backup codes only after normal password authentication and the hosted MFA check.
create function public.exm_member_open_hosted_session_with_codes(p_id uuid,p_token text,p_codes text[])
returns boolean language plpgsql security invoker set search_path = ''
as $$
begin
  if exm_member.needs_mfa(p_id) then return null; end if;
  return public.exm_member_open_session(p_id,p_token,p_codes);
end;
$$;
revoke all on function public.exm_member_open_hosted_session_with_codes(uuid,text,text[]) from public,anon,authenticated;
grant execute on function public.exm_member_open_hosted_session_with_codes(uuid,text,text[]) to service_role;

-- Reuse the verified XP ledger and enrich only the returned page of standings.
create function public.exm_member_standings(p_options jsonb)
returns jsonb language sql stable security invoker set search_path = ''
as $$
  with board as (select public.exm_member_platform_read(null,'rankings',p_options) as result)
  select result || jsonb_build_object('rows',(
    select coalesce(jsonb_agg(item || jsonb_build_object(
      'rosterRoute',r.route,
      'champion',exists(select 1 from exm_member.inventory i where i.profile_id=p.id and i.reward='champion-badge')
        or exists(select 1 from exm_member.roster_titles t where t.handle=r.handle),
      'titles',coalesce((select jsonb_agg(t.title order by t.season)
        from exm_member.roster_titles t where t.handle=r.handle),'[]')
    ) order by slot),'[]')
    from jsonb_array_elements(result->'rows') with ordinality as ranked(item,slot)
    join exm_member.profiles p on p.username=item->>'username' and p.discoverable
    left join exm_member.roster_credits r on r.profile_id=p.id
  )) from board
$$;
revoke all on function public.exm_member_standings(jsonb) from public,anon,authenticated;
grant execute on function public.exm_member_standings(jsonb) to service_role;
