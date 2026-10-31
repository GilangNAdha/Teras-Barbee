-- Multiple services are reserved as one continuous appointment. Existing single-service
-- appointments and RPCs continue to work, and retain their original snapshots.
alter table public.appointments
  add column booking_request_id uuid unique;
alter table public.appointments drop constraint appointments_duration_snapshot_positive;
alter table public.appointments add constraint appointments_duration_snapshot_positive
  check (duration_minutes_snapshot between 10 and 600);

create table public.appointment_services (
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete restrict,
  service_name text not null,
  price_idr integer not null check (price_idr >= 0),
  duration_minutes integer not null check (duration_minutes between 10 and 300),
  position smallint not null check (position between 1 and 5),
  primary key (appointment_id, service_id)
);
alter table public.appointment_services enable row level security;
grant select on public.appointment_services to authenticated;
grant all on public.appointment_services to service_role;
create policy "Admins read appointment services" on public.appointment_services
  for select to authenticated using (public.is_admin());

insert into public.appointment_services (appointment_id, service_id, service_name, price_idr, duration_minutes, position)
select id, service_id, service_name_snapshot, price_idr_snapshot, least(duration_minutes_snapshot, 300), 1
from public.appointments;

-- Keep legacy inserts and any explicit primary-service changes represented as
-- line items too. The new multi-service RPC adds the remaining lines atomically.
create or replace function public.initialize_appointment_services()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' or new.service_id is distinct from old.service_id then
    delete from public.appointment_services where appointment_id = new.id;
    insert into public.appointment_services (appointment_id, service_id, service_name, price_idr, duration_minutes, position)
    values (new.id, new.service_id, new.service_name_snapshot, new.price_idr_snapshot, new.duration_minutes_snapshot, 1);
  end if;
  return new;
end;
$$;
create trigger appointments_initialize_services after insert or update of service_id on public.appointments
  for each row execute function public.initialize_appointment_services();

-- Only the database calculates the total; clients cannot supply a shorter duration
-- or a different price to bypass availability and overlap checks.
create or replace function public.booking_selection_totals(p_service_ids uuid[])
returns table (total_minutes integer, total_price integer, service_names text)
language plpgsql stable security definer set search_path = public
as $$
declare
  v_count integer;
begin
  if coalesce(cardinality(p_service_ids), 0) not between 1 and 5
    or array_position(p_service_ids, null) is not null
    or (select count(distinct id) from unnest(p_service_ids) as ids(id)) <> cardinality(p_service_ids) then
    raise exception 'invalid_service_selection' using errcode = 'P0001';
  end if;
  select count(*)::integer, coalesce(sum(s.duration_minutes), 0)::integer,
         coalesce(sum(s.price_idr), 0)::integer, string_agg(s.name, ' + ' order by ids.ordinality)
    into v_count, total_minutes, total_price, service_names
  from unnest(p_service_ids) with ordinality as ids(id, ordinality)
  join public.services s on s.id = ids.id and s.is_active;
  if v_count <> cardinality(p_service_ids) then raise exception 'service_unavailable' using errcode = 'P0001'; end if;
  return next;
end;
$$;
revoke all on function public.booking_selection_totals(uuid[]) from public, anon, authenticated;

-- Internal slot generator. The duration override and excluded appointment are
-- only used by the token-protected reschedule function, never by public callers.
create or replace function public.booking_slots_internal(
  p_date date, p_service_ids uuid[], p_barber_id uuid,
  p_duration_override integer, p_exclude_appointment_id uuid
)
returns table (starts_at timestamptz, barber_id uuid, barber_name text, is_available boolean)
language plpgsql stable security definer set search_path = public
as $$
declare
  v_totals record;
  v_settings public.shop_settings%rowtype;
  v_shop public.shop_hours%rowtype;
  v_barber record;
  v_barber_hours public.barber_hours%rowtype;
  v_open time;
  v_close time;
  v_local_slot timestamp;
  v_start timestamptz;
  v_end timestamptz;
  v_duration integer;
  v_dow integer;
begin
  select * into v_totals from public.booking_selection_totals(p_service_ids);
  v_duration := coalesce(p_duration_override, v_totals.total_minutes);
  if v_duration not between 10 and 600 then raise exception 'invalid_duration' using errcode = 'P0001'; end if;
  select * into v_settings from public.shop_settings where id = 1;
  if not found then raise exception 'shop_not_configured' using errcode = 'P0001'; end if;
  if p_date is null or p_date < (now() at time zone v_settings.timezone)::date
    or p_date > (now() at time zone v_settings.timezone)::date + v_settings.booking_horizon_days then return; end if;
  v_dow := extract(dow from p_date)::integer;
  select * into v_shop from public.shop_hours where day_of_week = v_dow and not is_closed;
  if not found then return; end if;

  for v_barber in
    select b.id, b.name from public.barbers b
    where b.is_active and (p_barber_id is null or b.id = p_barber_id)
      and not exists (
        select 1 from unnest(p_service_ids) as chosen(id)
        where not exists (select 1 from public.barber_services bs where bs.barber_id = b.id and bs.service_id = chosen.id)
      )
    order by b.sort_order, b.name, b.id
  loop
    v_open := v_shop.opens_at;
    v_close := v_shop.closes_at;
    select * into v_barber_hours from public.barber_hours h where h.barber_id = v_barber.id and h.day_of_week = v_dow;
    if found then
      if v_barber_hours.is_closed then continue; end if;
      v_open := greatest(v_open, v_barber_hours.opens_at);
      v_close := least(v_close, v_barber_hours.closes_at);
    end if;
    if v_close <= v_open then continue; end if;
    for v_local_slot in
      select generate_series(p_date + v_open, p_date + v_close - make_interval(mins => v_duration), interval '30 minutes')
    loop
      v_start := v_local_slot at time zone v_settings.timezone;
      v_end := v_start + make_interval(mins => v_duration);
      -- Skip nonexistent local times during a daylight-saving transition, and
      -- ensure the actual elapsed interval still ends before local closing.
      if v_start at time zone v_settings.timezone <> v_local_slot
        or v_end at time zone v_settings.timezone > p_date + v_close then continue; end if;
      starts_at := v_start;
      barber_id := v_barber.id;
      barber_name := v_barber.name;
      is_available := v_start > now() + make_interval(mins => v_settings.booking_notice_minutes)
        and not exists (
          select 1 from public.appointments a
          where a.barber_id = v_barber.id and a.id is distinct from p_exclude_appointment_id
            and a.status in ('pending', 'confirmed')
            and (a.status = 'confirmed' or a.created_at > now() - interval '30 minutes')
            and a.starts_at < v_end and a.ends_at > v_start
        );
      return next;
    end loop;
  end loop;
end;
$$;
revoke all on function public.booking_slots_internal(date, uuid[], uuid, integer, uuid) from public, anon, authenticated;

create or replace function public.get_booking_slots(p_date date, p_service_ids uuid[], p_barber_id uuid default null)
returns table (starts_at timestamptz, barber_id uuid, barber_name text, is_available boolean)
language sql stable security definer set search_path = public
as $$ select * from public.booking_slots_internal(p_date, p_service_ids, p_barber_id, null, null); $$;
revoke all on function public.get_booking_slots(date, uuid[], uuid) from public;
grant execute on function public.get_booking_slots(date, uuid[], uuid) to anon, authenticated, service_role;

create or replace function public.get_booking_calendar(p_from date, p_to date, p_service_ids uuid[], p_barber_id uuid default null)
returns table (booking_date date, is_available boolean)
language plpgsql stable security definer set search_path = public
as $$
begin
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 41 then
    raise exception 'invalid_calendar_range' using errcode = 'P0001';
  end if;
  -- Validate even when the range contains only closed/out-of-window days.
  perform * from public.booking_selection_totals(p_service_ids);
  return query
    select d.day::date, exists (
      select 1 from public.booking_slots_internal(d.day::date, p_service_ids, p_barber_id, null, null) slot
      where slot.is_available
    )
    from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') as d(day)
    order by d.day;
end;
$$;
revoke all on function public.get_booking_calendar(date, date, uuid[], uuid) from public;
grant execute on function public.get_booking_calendar(date, date, uuid[], uuid) to anon, authenticated, service_role;

-- Idempotent creation: one high-entropy request id maps to one booking and one
-- management-token hash. Retries after a lost response return the original result.
create or replace function public.create_booking_request(
  p_service_ids uuid[], p_barber_id uuid, p_starts_at timestamptz,
  p_customer_name text, p_customer_phone text, p_notes text, p_client_hash text,
  p_manage_token_hash text, p_request_id uuid, p_expected_price integer, p_expected_duration integer
)
returns table (appointment_id uuid, booking_code text, barber_name text, service_name text,
               starts_at timestamptz, price_idr integer, duration_minutes integer, booking_status text)
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_existing record;
  v_totals record;
  v_settings public.shop_settings%rowtype;
  v_shop public.shop_hours%rowtype;
  v_barber record;
  v_barber_hours public.barber_hours%rowtype;
  v_local_start timestamp;
  v_local_date date;
  v_dow integer;
  v_end timestamptz;
  v_open time;
  v_close time;
  v_code text;
  v_id uuid;
  v_rate_count integer;
begin
  if p_request_id is null or coalesce(p_manage_token_hash, '') !~ '^[a-f0-9]{64}$'
    or coalesce(p_client_hash, '') !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid_booking_request' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('booking-request:' || p_request_id::text, 0));
  select a.id, a.booking_code, b.name as barber_name, a.service_name_snapshot, a.starts_at,
         a.price_idr_snapshot, a.duration_minutes_snapshot, a.status, t.token_hash
    into v_existing
  from public.appointments a join public.barbers b on b.id = a.barber_id
    join public.appointment_manage_tokens t on t.appointment_id = a.id
  where a.booking_request_id = p_request_id;
  if found then
    if v_existing.token_hash <> p_manage_token_hash then raise exception 'invalid_booking_request' using errcode = 'P0001'; end if;
    appointment_id := v_existing.id; booking_code := v_existing.booking_code; barber_name := v_existing.barber_name;
    service_name := v_existing.service_name_snapshot; starts_at := v_existing.starts_at;
    price_idr := v_existing.price_idr_snapshot; duration_minutes := v_existing.duration_minutes_snapshot; booking_status := v_existing.status;
    return next; return;
  end if;
  if length(trim(coalesce(p_customer_name, ''))) not between 2 and 80
    or length(trim(coalesce(p_customer_phone, ''))) not between 8 and 24
    or length(coalesce(p_notes, '')) > 500 or p_starts_at is null then
    raise exception 'invalid_customer_details' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('booking-rate:' || p_client_hash, 0));
  delete from public.booking_rate_limits where created_at < now() - interval '1 day';
  select count(*) into v_rate_count from public.booking_rate_limits where client_hash = p_client_hash and created_at > now() - interval '15 minutes';
  if v_rate_count >= 5 then raise exception 'booking_rate_limited' using errcode = 'P0001'; end if;
  insert into public.booking_rate_limits (client_hash) values (p_client_hash);

  -- Freeze selected service details for the duration of this transaction.
  perform 1 from public.services s where s.id = any(p_service_ids) order by s.id for share;
  select * into v_totals from public.booking_selection_totals(p_service_ids);
  if v_totals.total_minutes > 600 then raise exception 'services_too_long' using errcode = 'P0001'; end if;
  if (p_expected_price is not null and p_expected_price <> v_totals.total_price)
    or (p_expected_duration is not null and p_expected_duration <> v_totals.total_minutes) then
    raise exception 'service_details_changed' using errcode = 'P0001';
  end if;
  select * into v_settings from public.shop_settings where id = 1;
  if not found then raise exception 'shop_not_configured' using errcode = 'P0001'; end if;
  v_local_start := p_starts_at at time zone v_settings.timezone;
  v_local_date := v_local_start::date;
  v_dow := extract(dow from v_local_date)::integer;
  if p_starts_at <= now() + make_interval(mins => v_settings.booking_notice_minutes)
    or v_local_date > (now() at time zone v_settings.timezone)::date + v_settings.booking_horizon_days then
    raise exception 'booking_out_of_range' using errcode = 'P0001';
  end if;
  select * into v_shop from public.shop_hours where day_of_week = v_dow and not is_closed;
  if not found then raise exception 'shop_closed' using errcode = 'P0001'; end if;
  v_end := p_starts_at + make_interval(mins => v_totals.total_minutes);

  for v_barber in
    select b.id, b.name from public.barbers b
    where b.is_active and (p_barber_id is null or b.id = p_barber_id)
      and not exists (
        select 1 from unnest(p_service_ids) as chosen(id)
        where not exists (select 1 from public.barber_services bs where bs.barber_id = b.id and bs.service_id = chosen.id)
      )
    order by b.sort_order, b.name, b.id
  loop
    perform pg_advisory_xact_lock(hashtextextended('booking-slot:' || v_barber.id::text || ':' || v_local_date::text, 0));
    perform 1 from public.barber_services bs where bs.barber_id = v_barber.id and bs.service_id = any(p_service_ids) order by bs.service_id for share;
    if (select count(*) from public.barber_services bs where bs.barber_id = v_barber.id and bs.service_id = any(p_service_ids)) <> cardinality(p_service_ids) then continue; end if;
    v_open := v_shop.opens_at; v_close := v_shop.closes_at;
    select * into v_barber_hours from public.barber_hours h where h.barber_id = v_barber.id and h.day_of_week = v_dow;
    if found then
      if v_barber_hours.is_closed then continue; end if;
      v_open := greatest(v_open, v_barber_hours.opens_at); v_close := least(v_close, v_barber_hours.closes_at);
    end if;
    if v_close <= v_open or v_local_start::time < v_open or v_end at time zone v_settings.timezone > v_local_date + v_close
      or extract(second from v_local_start) <> 0
      or mod(extract(epoch from (v_local_start::time - v_open))::integer, 1800) <> 0 then continue; end if;
    if exists (
      select 1 from public.appointments a where a.barber_id = v_barber.id and a.status in ('pending', 'confirmed')
        and (a.status = 'confirmed' or a.created_at > now() - interval '30 minutes')
        and a.starts_at < v_end and a.ends_at > p_starts_at
    ) then continue; end if;

    v_code := upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 10));
    insert into public.appointments (booking_code, customer_name, customer_phone, service_id, barber_id, starts_at, ends_at, notes, booking_request_id)
    values (v_code, trim(p_customer_name), trim(p_customer_phone), p_service_ids[1], v_barber.id, p_starts_at, v_end, nullif(trim(p_notes), ''), p_request_id)
    returning id into v_id;
    insert into public.appointment_services (appointment_id, service_id, service_name, price_idr, duration_minutes, position)
    select v_id, s.id, s.name, s.price_idr, s.duration_minutes, ids.ordinality::smallint
    from unnest(p_service_ids) with ordinality as ids(id, ordinality) join public.services s on s.id = ids.id
    on conflict on constraint appointment_services_pkey do update set position = excluded.position;
    update public.appointments set service_name_snapshot = v_totals.service_names,
      price_idr_snapshot = v_totals.total_price, duration_minutes_snapshot = v_totals.total_minutes where id = v_id;
    insert into public.appointment_manage_tokens (appointment_id, token_hash, expires_at)
    values (v_id, p_manage_token_hash, now() + interval '90 days');
    update public.booking_audit_logs set changed_fields = changed_fields || jsonb_build_object(
      'service_ids', to_jsonb(p_service_ids), 'price_idr_snapshot', v_totals.total_price,
      'duration_minutes_snapshot', v_totals.total_minutes)
    where booking_audit_logs.appointment_id = v_id and action = 'created';
    appointment_id := v_id; booking_code := v_code; barber_name := v_barber.name;
    service_name := v_totals.service_names; starts_at := p_starts_at;
    price_idr := v_totals.total_price; duration_minutes := v_totals.total_minutes; booking_status := 'pending';
    return next; return;
  end loop;
  raise exception 'booking_slot_taken' using errcode = 'P0001';
end;
$$;
revoke all on function public.create_booking_request(uuid[], uuid, timestamptz, text, text, text, text, text, uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.create_booking_request(uuid[], uuid, timestamptz, text, text, text, text, text, uuid, integer, integer) to service_role;

-- Reschedule availability uses the saved duration and excludes the customer's
-- own appointment; the secret token is checked in the database, not in public RLS.
create or replace function public.get_managed_booking_slots(p_token_hash text, p_date date)
returns table (starts_at timestamptz, barber_id uuid, barber_name text, is_available boolean)
language plpgsql stable security definer set search_path = public
as $$
declare
  v_appointment public.appointments%rowtype;
  v_settings public.shop_settings%rowtype;
  v_service_ids uuid[];
begin
  if coalesce(p_token_hash, '') !~ '^[a-f0-9]{64}$' then raise exception 'manage_token_invalid' using errcode = 'P0001'; end if;
  select a.* into v_appointment from public.appointments a
    join public.appointment_manage_tokens t on t.appointment_id = a.id
    where t.token_hash = p_token_hash and t.revoked_at is null and t.expires_at > now();
  if not found then raise exception 'manage_token_invalid' using errcode = 'P0001'; end if;
  select * into v_settings from public.shop_settings where id = 1;
  if not found then raise exception 'shop_not_configured' using errcode = 'P0001'; end if;
  if v_appointment.status not in ('pending', 'confirmed')
    or (v_appointment.status = 'pending' and v_appointment.created_at <= now() - interval '30 minutes')
    or v_appointment.starts_at <= now() + make_interval(mins => v_settings.customer_reschedule_deadline_minutes) then return; end if;
  select array_agg(s.service_id order by s.position) into v_service_ids
    from public.appointment_services s where s.appointment_id = v_appointment.id;
  return query select * from public.booking_slots_internal(p_date, v_service_ids, v_appointment.barber_id,
    v_appointment.duration_minutes_snapshot, v_appointment.id);
end;
$$;
revoke all on function public.get_managed_booking_slots(text, date) from public, anon, authenticated;
grant execute on function public.get_managed_booking_slots(text, date) to service_role;

-- Keep the existing management contract while validating every service on reschedule.
create or replace function public.manage_public_booking(
  p_token_hash text,
  p_action text,
  p_new_starts_at timestamptz default null,
  p_cancellation_reason text default null
)
returns table (
  booking_code text,
  status text,
  service_name text,
  barber_name text,
  starts_at timestamptz,
  ends_at timestamptz,
  service_id uuid,
  barber_id uuid,
  price_idr integer,
  duration_minutes integer,
  timezone text,
  can_cancel boolean,
  can_reschedule boolean,
  cancellation_deadline_minutes integer,
  reschedule_deadline_minutes integer
)
language plpgsql security definer set search_path = public, extensions, auth
as $$
declare
  v_appointment_id uuid;
  v_appointment public.appointments%rowtype;
  v_service public.services%rowtype;
  v_barber public.barbers%rowtype;
  v_settings public.shop_settings%rowtype;
  v_shop public.shop_hours%rowtype;
  v_barber_hours public.barber_hours%rowtype;
  v_local_start timestamp;
  v_local_date date;
  v_local_end timestamp;
  v_day integer;
  v_open time;
  v_close time;
  v_end timestamptz;
  v_has_barber_hours boolean;
  v_can_cancel boolean;
  v_can_reschedule boolean;
begin
  if p_token_hash !~ '^[a-f0-9]{64}$' then raise exception 'manage_token_invalid' using errcode = 'P0001'; end if;
  if p_action is null or p_action not in ('view', 'cancel', 'reschedule') then raise exception 'invalid_manage_action' using errcode = 'P0001'; end if;
  select t.appointment_id into v_appointment_id
  from public.appointment_manage_tokens t
  where t.token_hash = p_token_hash and t.revoked_at is null and t.expires_at > now()
  for update;
  if not found then raise exception 'manage_token_invalid' using errcode = 'P0001'; end if;
  select * into v_appointment from public.appointments a where a.id = v_appointment_id for update;
  if not found then raise exception 'manage_token_invalid' using errcode = 'P0001'; end if;
  select * into v_settings from public.shop_settings s where s.id = 1;
  if not found then raise exception 'shop_not_configured' using errcode = 'P0001'; end if;

  if p_action = 'cancel' then
    if v_appointment.status not in ('pending', 'confirmed') then raise exception 'booking_not_manageable' using errcode = 'P0001'; end if;
    if v_appointment.starts_at <= now() + make_interval(mins => v_settings.customer_cancellation_deadline_minutes) then raise exception 'cancel_deadline_passed' using errcode = 'P0001'; end if;
    if length(coalesce(p_cancellation_reason, '')) > 300 then raise exception 'invalid_cancellation_reason' using errcode = 'P0001'; end if;
    update public.appointments a set status = 'cancelled', cancellation_reason = nullif(trim(p_cancellation_reason), ''), cancelled_at = now()
    where a.id = v_appointment.id returning * into v_appointment;
  elsif p_action = 'reschedule' then
    if v_appointment.status not in ('pending', 'confirmed') then raise exception 'booking_not_manageable' using errcode = 'P0001'; end if;
    -- An expired pending request no longer reserves a chair. Rescheduling it
    -- without a fresh hold would report success while leaving the slot open.
    if v_appointment.status = 'pending' and v_appointment.created_at <= now() - interval '30 minutes' then raise exception 'booking_hold_expired' using errcode = 'P0001'; end if;
    if v_appointment.starts_at <= now() + make_interval(mins => v_settings.customer_reschedule_deadline_minutes) then raise exception 'reschedule_deadline_passed' using errcode = 'P0001'; end if;
    if p_new_starts_at is null then raise exception 'reschedule_time_required' using errcode = 'P0001'; end if;
    select * into v_service from public.services s where s.id = v_appointment.service_id and s.is_active;
    if not found then raise exception 'service_unavailable' using errcode = 'P0001'; end if;
    select * into v_barber from public.barbers b where b.id = v_appointment.barber_id and b.is_active;
    if not found or not exists (select 1 from public.barber_services bs where bs.barber_id = v_appointment.barber_id and bs.service_id = v_appointment.service_id) then
      raise exception 'barber_unavailable' using errcode = 'P0001';
    end if;
    -- Every saved service must still be active and assigned to this barber.
    if exists (select 1 from public.appointment_services items
      join public.services s on s.id = items.service_id
      where items.appointment_id = v_appointment.id and not s.is_active) then
      raise exception 'service_unavailable' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.appointment_services items
      where items.appointment_id = v_appointment.id and not exists (
        select 1 from public.barber_services bs
        where bs.barber_id = v_appointment.barber_id and bs.service_id = items.service_id
      )) then raise exception 'barber_unavailable' using errcode = 'P0001'; end if;
    v_local_start := p_new_starts_at at time zone v_settings.timezone;
    v_local_date := v_local_start::date;
    v_day := extract(dow from v_local_date)::integer;
    if p_new_starts_at <= now() + make_interval(mins => v_settings.booking_notice_minutes)
      or v_local_date > ((now() at time zone v_settings.timezone)::date + v_settings.booking_horizon_days) then
      raise exception 'booking_out_of_range' using errcode = 'P0001';
    end if;
    select * into v_shop from public.shop_hours h where h.day_of_week = v_day and not h.is_closed;
    if not found then raise exception 'shop_closed' using errcode = 'P0001'; end if;
    v_open := v_shop.opens_at;
    v_close := v_shop.closes_at;
    select * into v_barber_hours from public.barber_hours h where h.barber_id = v_appointment.barber_id and h.day_of_week = v_day;
    v_has_barber_hours := found;
    if v_has_barber_hours then
      if v_barber_hours.is_closed then raise exception 'shop_closed' using errcode = 'P0001'; end if;
      v_open := greatest(v_open, v_barber_hours.opens_at);
      v_close := least(v_close, v_barber_hours.closes_at);
    end if;
    v_end := p_new_starts_at + make_interval(mins => v_appointment.duration_minutes_snapshot);
    v_local_end := v_end at time zone v_settings.timezone;
    if v_close <= v_open or v_local_start::time < v_open or v_local_end > v_local_date + v_close
      or extract(second from v_local_start) <> 0
      or mod(extract(epoch from (v_local_start::time - v_open))::integer, 1800) <> 0 then
      raise exception 'slot_unavailable' using errcode = 'P0001';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('booking-slot:' || v_appointment.barber_id::text || ':' || v_local_date::text, 0));
    if exists (
      select 1 from public.appointments a
      where a.id <> v_appointment.id and a.barber_id = v_appointment.barber_id
        and a.status in ('pending', 'confirmed')
        and (a.status = 'confirmed' or a.created_at > now() - interval '30 minutes')
        and a.starts_at < v_end and a.ends_at > p_new_starts_at
    ) then raise exception 'booking_slot_taken' using errcode = 'P0001'; end if;
    update public.appointments a set starts_at = p_new_starts_at, ends_at = v_end
    where a.id = v_appointment.id returning * into v_appointment;
  elsif p_action <> 'view' then
    raise exception 'invalid_manage_action' using errcode = 'P0001';
  end if;

  v_can_cancel := v_appointment.status in ('pending', 'confirmed') and v_appointment.starts_at > now() + make_interval(mins => v_settings.customer_cancellation_deadline_minutes);
  v_can_reschedule := v_appointment.status in ('pending', 'confirmed')
    and (v_appointment.status <> 'pending' or v_appointment.created_at > now() - interval '30 minutes')
    and v_appointment.starts_at > now() + make_interval(mins => v_settings.customer_reschedule_deadline_minutes);
  select * into v_barber from public.barbers b where b.id = v_appointment.barber_id;
  booking_code := v_appointment.booking_code;
  status := v_appointment.status;
  service_name := v_appointment.service_name_snapshot;
  barber_name := coalesce(v_barber.name, 'Terasbarber');
  starts_at := v_appointment.starts_at;
  ends_at := v_appointment.ends_at;
  service_id := v_appointment.service_id;
  barber_id := v_appointment.barber_id;
  price_idr := v_appointment.price_idr_snapshot;
  duration_minutes := v_appointment.duration_minutes_snapshot;
  timezone := v_settings.timezone;
  can_cancel := v_can_cancel;
  can_reschedule := v_can_reschedule;
  cancellation_deadline_minutes := v_settings.customer_cancellation_deadline_minutes;
  reschedule_deadline_minutes := v_settings.customer_reschedule_deadline_minutes;
  return next;
end;
$$;
revoke all on function public.manage_public_booking(text, text, timestamptz, text) from public, anon, authenticated;
grant execute on function public.manage_public_booking(text, text, timestamptz, text) to service_role;
