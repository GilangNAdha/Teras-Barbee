-- Secure, capability-based customer appointment management.
-- The browser receives a random token once; only its SHA-256 hash is stored.

alter table public.appointments
  add column service_name_snapshot text,
  add column price_idr_snapshot integer,
  add column duration_minutes_snapshot integer,
  add column cancellation_reason text,
  add column cancelled_at timestamptz;

update public.appointments a
set service_name_snapshot = s.name,
    price_idr_snapshot = s.price_idr,
    duration_minutes_snapshot = greatest(10, ceil(extract(epoch from (a.ends_at - a.starts_at)) / 60)::integer)
from public.services s
where s.id = a.service_id;

alter table public.appointments
  alter column service_name_snapshot set not null,
  alter column price_idr_snapshot set not null,
  alter column duration_minutes_snapshot set not null,
  add constraint appointments_price_snapshot_nonnegative check (price_idr_snapshot >= 0),
  add constraint appointments_duration_snapshot_positive check (duration_minutes_snapshot between 10 and 300),
  add constraint appointments_cancellation_reason_length check (cancellation_reason is null or length(cancellation_reason) <= 300);

alter table public.shop_settings
  add column customer_cancellation_deadline_minutes integer not null default 120
    check (customer_cancellation_deadline_minutes between 0 and 10080),
  add column customer_reschedule_deadline_minutes integer not null default 120
    check (customer_reschedule_deadline_minutes between 0 and 10080);

create table public.appointment_manage_tokens (
  appointment_id uuid primary key references public.appointments(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index appointment_manage_tokens_expiry_idx on public.appointment_manage_tokens (expires_at) where revoked_at is null;
alter table public.appointment_manage_tokens enable row level security;
grant select, insert, update, delete on public.appointment_manage_tokens to service_role;

create table public.booking_audit_logs (
  id bigint generated always as identity primary key,
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  actor text not null,
  action text not null,
  changed_fields jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index booking_audit_logs_appointment_created_idx on public.booking_audit_logs (appointment_id, created_at desc);
alter table public.booking_audit_logs enable row level security;
grant select on public.booking_audit_logs to authenticated;
grant select, insert on public.booking_audit_logs to service_role;
create policy "Admins read booking audit logs" on public.booking_audit_logs
  for select to authenticated using (public.is_admin());

create or replace function public.snapshot_appointment_service()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  v_service public.services%rowtype;
begin
  if tg_op = 'INSERT' or new.service_id is distinct from old.service_id then
    select * into v_service from public.services where id = new.service_id;
    if not found then raise exception 'service_unavailable' using errcode = 'P0001'; end if;
    new.service_name_snapshot := v_service.name;
    new.price_idr_snapshot := v_service.price_idr;
    new.duration_minutes_snapshot := v_service.duration_minutes;
  end if;
  return new;
end;
$$;
create trigger appointments_snapshot_service
  before insert or update of service_id on public.appointments
  for each row execute function public.snapshot_appointment_service();

create or replace function public.audit_appointment_change()
returns trigger language plpgsql security definer set search_path = public, auth
as $$
declare
  v_changes jsonb := '{}'::jsonb;
  v_action text := 'updated';
  v_actor text := coalesce(auth.uid()::text, 'server');
begin
  if tg_op = 'INSERT' then
    v_action := 'created';
    v_changes := jsonb_build_object(
      'status', new.status,
      'starts_at', new.starts_at,
      'ends_at', new.ends_at,
      'barber_id', new.barber_id,
      'service_id', new.service_id,
      'price_idr_snapshot', new.price_idr_snapshot,
      'duration_minutes_snapshot', new.duration_minutes_snapshot
    );
  else
    if new.status is distinct from old.status then v_changes := v_changes || jsonb_build_object('status', jsonb_build_object('from', old.status, 'to', new.status)); end if;
    if new.starts_at is distinct from old.starts_at then v_changes := v_changes || jsonb_build_object('starts_at', jsonb_build_object('from', old.starts_at, 'to', new.starts_at)); end if;
    if new.ends_at is distinct from old.ends_at then v_changes := v_changes || jsonb_build_object('ends_at', jsonb_build_object('from', old.ends_at, 'to', new.ends_at)); end if;
    if new.barber_id is distinct from old.barber_id then v_changes := v_changes || jsonb_build_object('barber_id', jsonb_build_object('from', old.barber_id, 'to', new.barber_id)); end if;
    if new.customer_name is distinct from old.customer_name then v_changes := v_changes || jsonb_build_object('customer_name', jsonb_build_object('from', old.customer_name, 'to', new.customer_name)); end if;
    if new.customer_phone is distinct from old.customer_phone then v_changes := v_changes || jsonb_build_object('customer_phone', jsonb_build_object('from', old.customer_phone, 'to', new.customer_phone)); end if;
    if new.cancellation_reason is distinct from old.cancellation_reason then v_changes := v_changes || jsonb_build_object('cancellation_reason', jsonb_build_object('from', old.cancellation_reason, 'to', new.cancellation_reason)); end if;
    if v_changes = '{}'::jsonb then return new; end if;
  end if;
  insert into public.booking_audit_logs (appointment_id, actor, action, changed_fields)
  values (new.id, v_actor, v_action, v_changes);
  return new;
end;
$$;
create trigger appointments_audit_changes
  after insert or update on public.appointments
  for each row execute function public.audit_appointment_change();

-- Keep the existing reservation function as the single source of truth, and add the
-- management capability in the same transaction so a booking can never be returned
-- without its secure token hash being persisted.
create or replace function public.create_public_booking_managed(
  p_service_id uuid,
  p_barber_id uuid,
  p_starts_at timestamptz,
  p_customer_name text,
  p_customer_phone text,
  p_notes text,
  p_client_hash text,
  p_manage_token_hash text
)
returns table (appointment_id uuid, booking_code text, barber_name text, service_name text, starts_at timestamptz)
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_booking record;
begin
  if p_manage_token_hash !~ '^[a-f0-9]{64}$' then raise exception 'invalid_manage_token' using errcode = 'P0001'; end if;
  for v_booking in
    select * from public.create_public_booking(p_service_id, p_barber_id, p_starts_at, p_customer_name, p_customer_phone, p_notes, p_client_hash)
  loop
    insert into public.appointment_manage_tokens (appointment_id, token_hash, expires_at)
    values (v_booking.appointment_id, p_manage_token_hash, now() + interval '90 days');
    appointment_id := v_booking.appointment_id;
    booking_code := v_booking.booking_code;
    barber_name := v_booking.barber_name;
    service_name := v_booking.service_name;
    starts_at := v_booking.starts_at;
    return next;
  end loop;
end;
$$;
revoke all on function public.create_public_booking_managed(uuid, uuid, timestamptz, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.create_public_booking_managed(uuid, uuid, timestamptz, text, text, text, text, text) to service_role;

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
    if v_appointment.starts_at <= now() + make_interval(mins => v_settings.customer_reschedule_deadline_minutes) then raise exception 'reschedule_deadline_passed' using errcode = 'P0001'; end if;
    if p_new_starts_at is null then raise exception 'reschedule_time_required' using errcode = 'P0001'; end if;
    select * into v_service from public.services s where s.id = v_appointment.service_id and s.is_active;
    if not found then raise exception 'service_unavailable' using errcode = 'P0001'; end if;
    select * into v_barber from public.barbers b where b.id = v_appointment.barber_id and b.is_active;
    if not found or not exists (select 1 from public.barber_services bs where bs.barber_id = v_appointment.barber_id and bs.service_id = v_appointment.service_id) then
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
  v_can_reschedule := v_appointment.status in ('pending', 'confirmed') and v_appointment.starts_at > now() + make_interval(mins => v_settings.customer_reschedule_deadline_minutes);
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
