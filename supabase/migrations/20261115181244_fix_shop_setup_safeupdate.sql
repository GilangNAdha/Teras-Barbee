-- PostgREST connects as authenticator with safeupdate enabled, which rejects
-- DELETE statements without a WHERE clause even inside SECURITY DEFINER RPCs.
create or replace function public.admin_update_shop_setup(
  p_shop_name text, p_address text, p_city text, p_timezone text, p_phone_whatsapp text,
  p_instagram_url text, p_booking_notice_minutes integer, p_booking_horizon_days integer, p_hours jsonb
)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'admin_required' using errcode = '42501'; end if;
  if length(trim(p_shop_name)) not between 2 and 80 or p_booking_notice_minutes not between 0 and 10080 or p_booking_horizon_days not between 1 and 180 then raise exception 'invalid_shop_setup'; end if;
  if jsonb_typeof(p_hours) <> 'array' or jsonb_array_length(p_hours) <> 7 then raise exception 'invalid_shop_hours'; end if;
  insert into public.shop_settings (
    id, shop_name, address, city, timezone, phone_whatsapp, instagram_url,
    booking_notice_minutes, booking_horizon_days
  )
  values (
    1, trim(p_shop_name), nullif(trim(p_address), ''), nullif(trim(p_city), ''),
    p_timezone, nullif(trim(p_phone_whatsapp), ''), nullif(trim(p_instagram_url), ''),
    p_booking_notice_minutes, p_booking_horizon_days
  )
  on conflict (id) do update set
    shop_name = excluded.shop_name,
    address = excluded.address,
    city = excluded.city,
    timezone = excluded.timezone,
    phone_whatsapp = excluded.phone_whatsapp,
    instagram_url = excluded.instagram_url,
    booking_notice_minutes = excluded.booking_notice_minutes,
    booking_horizon_days = excluded.booking_horizon_days;
  delete from public.shop_hours where day_of_week between 0 and 6;
  insert into public.shop_hours (day_of_week, opens_at, closes_at, is_closed)
  select x.day_of_week, x.opens_at, x.closes_at, x.is_closed
  from jsonb_to_recordset(p_hours) as x(day_of_week smallint, opens_at time, closes_at time, is_closed boolean);
end;
$$;
revoke all on function public.admin_update_shop_setup(text, text, text, text, text, text, integer, integer, jsonb) from public;
grant execute on function public.admin_update_shop_setup(text, text, text, text, text, text, integer, integer, jsonb) to authenticated;
