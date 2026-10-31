revoke all on function public.create_public_booking(uuid, uuid, timestamptz, text, text, text, text) from public, anon, authenticated;
grant execute on function public.create_public_booking(uuid, uuid, timestamptz, text, text, text, text) to service_role;
