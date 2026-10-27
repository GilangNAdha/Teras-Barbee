-- Buffer-aware scheduling, barber time-off support and client idempotency.
-- These are CREATE OR REPLACE upgrades of the existing guarded functions;
-- table semantics and error codes stay backward compatible.

-- ---------------------------------------------------------------------------
-- Overlap trigger: maintain the buffer-aware busy range and keep using the
-- advisory lock + expired-pending cleanup semantics from the initial schema.
-- ---------------------------------------------------------------------------

create or replace function public.enforce_appointment_no_overlap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_buffer_minutes integer := 0;
begin
  if new.status not in ('pending', 'confirmed') then
    return new;
  end if;

  select coalesce(s.buffer_minutes, 0) into v_buffer_minutes
  from public.services s
  where s.id = new.service_id;

  new.busy_until := new.ends_at + make_interval(mins => coalesce(v_buffer_minutes, 0));

  perform pg_advisory_xact_lock(hashtextextended('appointment-guard:' || new.barber_id::text, 0));

  -- Expired pending requests silently release their slot when a conflicting
  -- active reservation arrives.
  update public.appointments a
     set status = 'cancelled',
         cancelled_at = now(),
         cancellation_reason = coalesce(
           a.cancellation_reason,
           'Automatically expired after the pending confirmation window.'
         )
   where a.id is distinct from new.id
     and a.barber_id = new.barber_id
     and a.status = 'pending'
     and a.created_at <= now() - interval '30 minutes'
     and a.starts_at < new.busy_until
     and coalesce(a.busy_until, a.ends_at) > new.starts_at;

  if exists (
    select 1
    from public.appointments a
    where a.id is distinct from new.id
      and a.barber_id = new.barber_id
      and a.status in ('pending', 'confirmed')
      and a.starts_at < new.busy_until
      and coalesce(a.busy_until, a.ends_at) > new.starts_at
  ) then
    raise exception 'booking_slot_taken' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

-- Any row inserted between the two migration releases still has a NULL range;
-- the trigger above keeps it populated from now on.
update public.appointments set busy_until = ends_at where busy_until is null;
alter table public.appointments alter column busy_until set not null;

-- ---------------------------------------------------------------------------
-- Public availability: honour service buffers and barber time off.
-- ---------------------------------------------------------------------------

create or replace function public.get_public_availability(
  p_date date,
  p_service_id uuid,
  p_barber_id uuid default null
)
returns table (starts_at timestamptz, barber_id uuid, barber_name text)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_service public.services%rowtype;
  v_settings public.shop_settings%rowtype;
  v_shop public.shop_hours%rowtype;
  v_barber record;
  v_local_slot timestamp;
  v_start timestamptz;
  v_end timestamptz;
  v_open time;
  v_close time;
  v_barber_hours public.barber_hours%rowtype;
  v_has_barber_hours boolean;
  v_dow integer;
  v_required interval;
begin
  select * into v_service from public.services where id = p_service_id and is_active;
  if not found then
    raise exception 'service_unavailable' using errcode = 'P0001';
  end if;

  select * into v_settings from public.shop_settings where id = 1;
  if not found then
    raise exception 'shop_not_configured' using errcode = 'P0001';
  end if;

  if p_date < (now() at time zone v_settings.timezone)::date
     or p_date > ((now() at time zone v_settings.timezone)::date + v_settings.booking_horizon_days) then
    return;
  end if;

  v_dow := extract(dow from p_date)::integer;
  select * into v_shop from public.shop_hours where day_of_week = v_dow and not is_closed;
  if not found then
    return;
  end if;

  v_required := make_interval(mins => v_service.duration_minutes + coalesce(v_service.buffer_minutes, 0));

  for v_barber in
    select b.id, b.name
    from public.barbers b
    join public.barber_services bs on bs.barber_id = b.id and bs.service_id = v_service.id
    where b.is_active and (p_barber_id is null or b.id = p_barber_id)
    order by b.sort_order, b.name
  loop
    v_open := v_shop.opens_at;
    v_close := v_shop.closes_at;

    select * into v_barber_hours
    from public.barber_hours
    where barber_hours.barber_id = v_barber.id and day_of_week = v_dow;
    v_has_barber_hours := found;
    if v_has_barber_hours then
      if v_barber_hours.is_closed then
        continue;
      end if;
      v_open := greatest(v_open, v_barber_hours.opens_at);
      v_close := least(v_close, v_barber_hours.closes_at);
    end if;

    if v_close <= v_open then
      continue;
    end if;

    for v_local_slot in
      select generate_series(
        p_date + v_open,
        p_date + v_close - v_required,
        interval '30 minutes'
      )
    loop
      v_start := v_local_slot at time zone v_settings.timezone;
      v_end := v_start + v_required;

      if v_start < now() + make_interval(mins => v_settings.booking_notice_minutes) then
        continue;
      end if;

      if exists (
        select 1 from public.barber_time_off t
        where t.barber_id = v_barber.id
          and t.start_at < v_end
          and t.end_at > v_start
      ) then
        continue;
      end if;

      if exists (
        select 1
        from public.appointments a
        where a.barber_id = v_barber.id
          and a.status in ('pending', 'confirmed')
          and (a.status = 'confirmed' or a.created_at > now() - interval '30 minutes')
          and a.starts_at < v_end
          and coalesce(a.busy_until, a.ends_at) > v_start
      ) then
        continue;
      end if;

      starts_at := v_start;
      barber_id := v_barber.id;
      barber_name := v_barber.name;
      return next;
    end loop;
  end loop;
end;
$$;
revoke all on function public.get_public_availability(date, uuid, uuid) from public;
grant execute on function public.get_public_availability(date, uuid, uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Atomic public booking creation, now with idempotency replay, buffer-aware
-- conflict checks and barber time-off validation.
-- ---------------------------------------------------------------------------

drop function if exists public.create_public_booking(uuid, uuid, timestamptz, text, text, text, text);

create or replace function public.create_public_booking(
  p_service_id uuid,
  p_barber_id uuid,
  p_starts_at timestamptz,
  p_customer_name text,
  p_customer_phone text,
  p_notes text,
  p_client_hash text,
  p_idempotency_key text default null
)
returns table (
  appointment_id uuid,
  booking_code text,
  barber_name text,
  service_name text,
  starts_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_service public.services%rowtype;
  v_settings public.shop_settings%rowtype;
  v_shop public.shop_hours%rowtype;
  v_barber record;
  v_local_start timestamp;
  v_local_date date;
  v_dow integer;
  v_end timestamptz;
  v_busy_end timestamptz;
  v_open time;
  v_close time;
  v_barber_hours public.barber_hours%rowtype;
  v_has_barber_hours boolean;
  v_code text;
  v_rate_count integer;
  v_replay record;
begin
  if length(trim(p_customer_name)) not between 2 and 80
     or length(trim(p_customer_phone)) not between 8 and 24
     or length(coalesce(p_notes, '')) > 500 then
    raise exception 'invalid_customer_details' using errcode = 'P0001';
  end if;
  if p_client_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid_rate_key' using errcode = 'P0001';
  end if;
  if p_idempotency_key is not null and p_idempotency_key !~ '^[A-Za-z0-9_-]{8,200}$' then
    raise exception 'invalid_idempotency_key' using errcode = 'P0001';
  end if;

  -- Idempotent replay: retried submissions with the same key return the
  -- original booking instead of creating a duplicate.
  if p_idempotency_key is not null then
    select a.id, a.booking_code, b.name as barber_name, s.name as service_name, a.starts_at
      into v_replay
    from public.appointments a
    join public.barbers b on b.id = a.barber_id
    join public.services s on s.id = a.service_id
    where a.idempotency_key = p_idempotency_key;
    if found then
      appointment_id := v_replay.id;
      booking_code := v_replay.booking_code;
      barber_name := v_replay.barber_name;
      service_name := v_replay.service_name;
      starts_at := v_replay.starts_at;
      return next;
      return;
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('booking-rate:' || p_client_hash, 0));
  delete from public.booking_rate_limits where created_at < now() - interval '1 day';
  select count(*) into v_rate_count
  from public.booking_rate_limits
  where client_hash = p_client_hash and created_at > now() - interval '15 minutes';
  if v_rate_count >= 5 then
    raise exception 'booking_rate_limited' using errcode = 'P0001';
  end if;
  insert into public.booking_rate_limits (client_hash) values (p_client_hash);

  select * into v_service from public.services where id = p_service_id and is_active;
  if not found then
    raise exception 'service_unavailable' using errcode = 'P0001';
  end if;
  select * into v_settings from public.shop_settings where id = 1;
  if not found then
    raise exception 'shop_not_configured' using errcode = 'P0001';
  end if;

  v_local_start := p_starts_at at time zone v_settings.timezone;
  v_local_date := v_local_start::date;
  v_dow := extract(dow from v_local_date)::integer;

  if p_starts_at <= now() + make_interval(mins => v_settings.booking_notice_minutes)
     or v_local_date > ((now() at time zone v_settings.timezone)::date + v_settings.booking_horizon_days) then
    raise exception 'booking_out_of_range' using errcode = 'P0001';
  end if;

  select * into v_shop from public.shop_hours where day_of_week = v_dow and not is_closed;
  if not found then
    raise exception 'shop_closed' using errcode = 'P0001';
  end if;

  v_end := p_starts_at + make_interval(mins => v_service.duration_minutes);
  v_busy_end := v_end + make_interval(mins => coalesce(v_service.buffer_minutes, 0));

  for v_barber in
    select b.id, b.name
    from public.barbers b
    join public.barber_services bs on bs.barber_id = b.id and bs.service_id = v_service.id
    where b.is_active and (p_barber_id is null or b.id = p_barber_id)
    order by b.sort_order, b.name
  loop
    perform pg_advisory_xact_lock(
      hashtextextended('booking-slot:' || v_barber.id::text || ':' || v_local_date::text, 0)
    );

    v_open := v_shop.opens_at;
    v_close := v_shop.closes_at;
    select * into v_barber_hours
    from public.barber_hours
    where barber_hours.barber_id = v_barber.id and day_of_week = v_dow;
    v_has_barber_hours := found;
    if v_has_barber_hours then
      if v_barber_hours.is_closed then
        continue;
      end if;
      v_open := greatest(v_open, v_barber_hours.opens_at);
      v_close := least(v_close, v_barber_hours.closes_at);
    end if;

    if v_local_start::time < v_open
       or (v_busy_end at time zone v_settings.timezone) > v_local_date + v_close then
      continue;
    end if;
    if extract(second from v_local_start) <> 0
       or mod(extract(epoch from (v_local_start::time - v_open))::integer, 1800) <> 0 then
      continue;
    end if;

    if exists (
      select 1 from public.barber_time_off t
      where t.barber_id = v_barber.id
        and t.start_at < v_busy_end
        and t.end_at > p_starts_at
    ) then
      continue;
    end if;

    if exists (
      select 1 from public.appointments a
      where a.barber_id = v_barber.id
        and a.status in ('pending', 'confirmed')
        and (a.status = 'confirmed' or a.created_at > now() - interval '30 minutes')
        and a.starts_at < v_busy_end
        and coalesce(a.busy_until, a.ends_at) > p_starts_at
    ) then
      continue;
    end if;

    v_code := upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 10));

    insert into public.appointments (
      booking_code, customer_name, customer_phone, service_id, barber_id,
      starts_at, ends_at, notes, idempotency_key
    )
    values (
      v_code, trim(p_customer_name), trim(p_customer_phone), v_service.id, v_barber.id,
      p_starts_at, v_end, nullif(trim(p_notes), ''), p_idempotency_key
    )
    returning id into appointment_id;

    booking_code := v_code;
    barber_name := v_barber.name;
    service_name := v_service.name;
    starts_at := p_starts_at;
    return next;
    return;
  end loop;

  raise exception 'booking_slot_taken' using errcode = 'P0001';
end;
$$;
revoke all on function public.create_public_booking(uuid, uuid, timestamptz, text, text, text, text, text) from public, anon;
grant execute on function public.create_public_booking(uuid, uuid, timestamptz, text, text, text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- Managed variant: same idempotency guarantees plus atomic token persistence.
-- ---------------------------------------------------------------------------

drop function if exists public.create_public_booking_managed(uuid, uuid, timestamptz, text, text, text, text, text);

create or replace function public.create_public_booking_managed(
  p_service_id uuid,
  p_barber_id uuid,
  p_starts_at timestamptz,
  p_customer_name text,
  p_customer_phone text,
  p_notes text,
  p_client_hash text,
  p_manage_token_hash text,
  p_idempotency_key text default null
)
returns table (
  appointment_id uuid,
  booking_code text,
  barber_name text,
  service_name text,
  starts_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_booking record;
begin
  if p_manage_token_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid_manage_token' using errcode = 'P0001';
  end if;

  for v_booking in
    select *
    from public.create_public_booking(
      p_service_id, p_barber_id, p_starts_at, p_customer_name,
      p_customer_phone, p_notes, p_client_hash, p_idempotency_key
    )
  loop
    -- On idempotent replay the token row already exists; do not error on it.
    insert into public.appointment_manage_tokens (appointment_id, token_hash, expires_at)
    values (v_booking.appointment_id, p_manage_token_hash, now() + interval '90 days')
    on conflict (appointment_id) do nothing;

    appointment_id := v_booking.appointment_id;
    booking_code := v_booking.booking_code;
    barber_name := v_booking.barber_name;
    service_name := v_booking.service_name;
    starts_at := v_booking.starts_at;
    return next;
  end loop;
end;
$$;
revoke all on function public.create_public_booking_managed(uuid, uuid, timestamptz, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.create_public_booking_managed(uuid, uuid, timestamptz, text, text, text, text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- Customer management RPC: rescheduling now honours buffers and time off.
-- ---------------------------------------------------------------------------

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
language plpgsql
security definer
set search_path = public, extensions, auth
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
  v_busy_end timestamptz;
  v_has_barber_hours boolean;
  v_can_cancel boolean;
  v_can_reschedule boolean;
begin
  if p_token_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'manage_token_invalid' using errcode = 'P0001';
  end if;
  if p_action is null or p_action not in ('view', 'cancel', 'reschedule') then
    raise exception 'invalid_manage_action' using errcode = 'P0001';
  end if;

  select t.appointment_id into v_appointment_id
  from public.appointment_manage_tokens t
  where t.token_hash = p_token_hash
    and t.revoked_at is null
    and t.expires_at > now()
  for update;
  if not found then
    raise exception 'manage_token_invalid' using errcode = 'P0001';
  end if;

  select * into v_appointment from public.appointments a where a.id = v_appointment_id for update;
  if not found then
    raise exception 'manage_token_invalid' using errcode = 'P0001';
  end if;

  select * into v_settings from public.shop_settings s where s.id = 1;
  if not found then
    raise exception 'shop_not_configured' using errcode = 'P0001';
  end if;

  if p_action = 'cancel' then
    if v_appointment.status not in ('pending', 'confirmed') then
      raise exception 'booking_not_manageable' using errcode = 'P0001';
    end if;
    if v_appointment.starts_at <= now() + make_interval(mins => v_settings.customer_cancellation_deadline_minutes) then
      raise exception 'cancel_deadline_passed' using errcode = 'P0001';
    end if;
    if length(coalesce(p_cancellation_reason, '')) > 300 then
      raise exception 'invalid_cancellation_reason' using errcode = 'P0001';
    end if;

    update public.appointments a
       set status = 'cancelled',
           cancellation_reason = nullif(trim(p_cancellation_reason), ''),
           cancelled_at = now()
    where a.id = v_appointment.id
    returning * into v_appointment;

  elsif p_action = 'reschedule' then
    if v_appointment.status not in ('pending', 'confirmed') then
      raise exception 'booking_not_manageable' using errcode = 'P0001';
    end if;
    if v_appointment.starts_at <= now() + make_interval(mins => v_settings.customer_reschedule_deadline_minutes) then
      raise exception 'reschedule_deadline_passed' using errcode = 'P0001';
    end if;
    if p_new_starts_at is null then
      raise exception 'reschedule_time_required' using errcode = 'P0001';
    end if;

    select * into v_service from public.services s where s.id = v_appointment.service_id and s.is_active;
    if not found then
      raise exception 'service_unavailable' using errcode = 'P0001';
    end if;
    select * into v_barber from public.barbers b where b.id = v_appointment.barber_id and b.is_active;
    if not found
       or not exists (
         select 1 from public.barber_services bs
         where bs.barber_id = v_appointment.barber_id
           and bs.service_id = v_appointment.service_id
       ) then
      raise exception 'barber_unavailable' using errcode = 'P0001';
    end if;

    v_local_start := p_new_starts_at at time zone v_settings.timezone;
    v_local_date := v_local_start::date;
    v_day := extract(dow from v_local_date)::integer;

    if p_new_starts_at <= now() + make_interval(mins => v_settings.booking_notice_minutes)
       or v_local_date > ((now() at time zone v_settings.timezone)::date + v_settings.booking_horizon_days) then
      raise exception 'booking_out_of_range' using errcode = 'P0001';
    end if;

    select * into v_shop from public.shop_hours h where h.day_of_week = v_day and not h.is_closed;
    if not found then
      raise exception 'shop_closed' using errcode = 'P0001';
    end if;

    v_open := v_shop.opens_at;
    v_close := v_shop.closes_at;
    select * into v_barber_hours
    from public.barber_hours h
    where h.barber_id = v_appointment.barber_id and h.day_of_week = v_day;
    v_has_barber_hours := found;
    if v_has_barber_hours then
      if v_barber_hours.is_closed then
        raise exception 'shop_closed' using errcode = 'P0001';
      end if;
      v_open := greatest(v_open, v_barber_hours.opens_at);
      v_close := least(v_close, v_barber_hours.closes_at);
    end if;

    v_end := p_new_starts_at + make_interval(mins => v_appointment.duration_minutes_snapshot);
    v_busy_end := v_end + make_interval(mins => coalesce(v_service.buffer_minutes, 0));
    v_local_end := v_busy_end at time zone v_settings.timezone;

    if v_close <= v_open
       or v_local_start::time < v_open
       or v_local_end > v_local_date + v_close
       or extract(second from v_local_start) <> 0
       or mod(extract(epoch from (v_local_start::time - v_open))::integer, 1800) <> 0 then
      raise exception 'slot_unavailable' using errcode = 'P0001';
    end if;

    if exists (
      select 1 from public.barber_time_off t
      where t.barber_id = v_appointment.barber_id
        and t.start_at < v_busy_end
        and t.end_at > p_new_starts_at
    ) then
      raise exception 'shop_closed' using errcode = 'P0001';
    end if;

    perform pg_advisory_xact_lock(
      hashtextextended('booking-slot:' || v_appointment.barber_id::text || ':' || v_local_date::text, 0)
    );

    if exists (
      select 1 from public.appointments a
      where a.id <> v_appointment.id
        and a.barber_id = v_appointment.barber_id
        and a.status in ('pending', 'confirmed')
        and (a.status = 'confirmed' or a.created_at > now() - interval '30 minutes')
        and a.starts_at < v_busy_end
        and coalesce(a.busy_until, a.ends_at) > p_new_starts_at
    ) then
      raise exception 'booking_slot_taken' using errcode = 'P0001';
    end if;

    update public.appointments a
       set starts_at = p_new_starts_at,
           ends_at = v_end
    where a.id = v_appointment.id
    returning * into v_appointment;

  elsif p_action <> 'view' then
    raise exception 'invalid_manage_action' using errcode = 'P0001';
  end if;

  v_can_cancel := v_appointment.status in ('pending', 'confirmed')
    and v_appointment.starts_at > now() + make_interval(mins => v_settings.customer_cancellation_deadline_minutes);
  v_can_reschedule := v_appointment.status in ('pending', 'confirmed')
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
