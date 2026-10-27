create or replace function public.admin_revoke_booking_manage_token(p_appointment_id uuid)
returns void language plpgsql security definer set search_path = public, auth
as $$
begin
  if not public.is_admin() then raise exception 'admin_required' using errcode = '42501'; end if;
  update public.appointment_manage_tokens
    set revoked_at = coalesce(revoked_at, now())
    where appointment_id = p_appointment_id;
  if found then
    insert into public.booking_audit_logs (appointment_id, actor, action, changed_fields)
    values (p_appointment_id, auth.uid()::text, 'management_link_revoked', '{}'::jsonb);
  end if;
end;
$$;
revoke all on function public.admin_revoke_booking_manage_token(uuid) from public, anon;
grant execute on function public.admin_revoke_booking_manage_token(uuid) to authenticated;
