-- Notification outbox, delivery logs, scheduling support and hard overlap guarantees.
-- Everything in this migration is additive and non-destructive: existing rows and
-- bookings are preserved, and every new table is locked down with RLS.

create extension if not exists btree_gist with schema extensions;

-- ---------------------------------------------------------------------------
-- Reconcile profiles / services / settings with the required domain fields.
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists barber_id uuid references public.barbers(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

create trigger profiles_touch_updated
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Buffers reserve cleanup/turnover time after a service. display_order is a
-- read-only alias of the existing sort_order column so older admin code keeps working.
alter table public.services
  add column if not exists buffer_minutes integer not null default 0
    check (buffer_minutes between 0 and 240),
  add column if not exists display_order integer generated always as (sort_order) stored;

alter table public.shop_settings
  add column if not exists default_buffer_minutes integer not null default 0
    check (default_buffer_minutes between 0 and 240),
  add column if not exists notification_preferences jsonb not null default '{}'::jsonb;

-- Private barber notification destinations. This table is already invisible to
-- anon/authenticated non-admin roles; Telegram chat ids must never be public.
alter table public.barber_contact_channels
  add column if not exists telegram_chat_id text
    check (telegram_chat_id is null or length(telegram_chat_id) between 4 and 64);

-- Appointment provenance, client-safe idempotency and the buffer-aware busy range.
alter table public.appointments
  add column if not exists booking_source text not null default 'online'
    check (booking_source in ('online', 'admin', 'walk_in')),
  add column if not exists idempotency_key text
    check (idempotency_key is null or length(idempotency_key) between 8 and 200),
  add column if not exists busy_until timestamptz;

update public.appointments set busy_until = ends_at where busy_until is null;

create unique index appointments_idempotency_key_idx
  on public.appointments (idempotency_key)
  where idempotency_key is not null;

-- ---------------------------------------------------------------------------
-- Barber leave / breaks / holidays.
-- ---------------------------------------------------------------------------

create table if not exists public.barber_time_off (
  id uuid primary key default gen_random_uuid(),
  barber_id uuid not null references public.barbers(id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz not null,
  reason text check (reason is null or length(reason) <= 300),
  created_at timestamptz not null default now(),
  check (end_at > start_at)
);
create index if not exists barber_time_off_barber_range_idx
  on public.barber_time_off (barber_id, start_at, end_at);

alter table public.barber_time_off enable row level security;
revoke all on public.barber_time_off from public, anon;
grant all on public.barber_time_off to service_role;
grant select, insert, update, delete on public.barber_time_off to authenticated;
drop policy if exists "Admins manage barber time off" on public.barber_time_off;
create policy "Admins manage barber time off"
  on public.barber_time_off for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Private, single-row notification configuration. No API secrets live here;
-- secrets stay in the server environment. This row only stores destinations
-- and operator preferences, and is never exposed to anonymous browsers.
-- ---------------------------------------------------------------------------

create table if not exists public.notification_settings (
  id integer primary key default 1 check (id = 1),
  admin_telegram_chat_id text
    check (admin_telegram_chat_id is null or length(admin_telegram_chat_id) between 4 and 64),
  channels text[] not null default '{telegram,whatsapp}'
    check (channels <@ array['telegram', 'whatsapp']::text[]),
  reminder_hours integer not null default 24 check (reminder_hours between 1 and 168),
  updated_at timestamptz not null default now()
);
insert into public.notification_settings (id) values (1) on conflict do nothing;

alter table public.notification_settings enable row level security;
revoke all on public.notification_settings from public, anon;
grant all on public.notification_settings to service_role;
grant select, update on public.notification_settings to authenticated;
drop policy if exists "Admins manage notification settings" on public.notification_settings;
create policy "Admins manage notification settings"
  on public.notification_settings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create trigger notification_settings_touch_updated
  before update on public.notification_settings
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Transactional outbox: notification jobs.
-- ---------------------------------------------------------------------------

create table if not exists public.notification_jobs (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  event_type text not null check (event_type in (
    'booking_created', 'booking_confirmed', 'booking_rescheduled',
    'booking_cancelled', 'barber_assignment_changed', 'appointment_reminder'
  )),
  channel text not null check (channel in ('telegram', 'whatsapp')),
  recipient text not null check (length(recipient) between 2 and 128),
  idempotency_key text not null unique check (length(idempotency_key) <= 200),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'sent', 'failed', 'dead')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 5 check (max_attempts between 1 and 10),
  scheduled_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_until timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists notification_jobs_due_idx
  on public.notification_jobs (scheduled_at)
  where status = 'pending';
create index if not exists notification_jobs_lease_idx
  on public.notification_jobs (locked_until)
  where status = 'processing';
create index if not exists notification_jobs_appointment_event_idx
  on public.notification_jobs (appointment_id, event_type);

alter table public.notification_jobs enable row level security;
revoke all on public.notification_jobs from public, anon;
grant all on public.notification_jobs to service_role;
grant select on public.notification_jobs to authenticated;
drop policy if exists "Admins inspect notification jobs" on public.notification_jobs;
create policy "Admins inspect notification jobs"
  on public.notification_jobs for select to authenticated
  using (public.is_admin());

create trigger notification_jobs_touch_updated
  before update on public.notification_jobs
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Individual delivery attempts.
-- ---------------------------------------------------------------------------

create table if not exists public.notification_logs (
  id bigint generated always as identity primary key,
  notification_job_id uuid not null references public.notification_jobs(id) on delete cascade,
  provider_message_id text,
  status text not null check (status in ('attempted', 'sent', 'failed', 'skipped')),
  response_code text,
  error_message text,
  attempted_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists notification_logs_job_idx
  on public.notification_logs (notification_job_id, attempted_at desc);

alter table public.notification_logs enable row level security;
revoke all on public.notification_logs from public, anon;
grant all on public.notification_logs to service_role;
grant usage, select on sequence public.notification_logs_id_seq to service_role;
grant select on public.notification_logs to authenticated;
drop policy if exists "Admins inspect notification logs" on public.notification_logs;
create policy "Admins inspect notification logs"
  on public.notification_logs for select to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Hard database-level overlap guarantee. The application trigger already
-- serializes writes with advisory locks; this partial exclusion constraint is
-- the last line of defence and enforces half-open [starts_at, busy_until)
-- ranges, so back-to-back bookings remain allowed. Rows with a NULL busy_until
-- are ignored until the follow-up migration backfills and enforces NOT NULL.
-- Fail loudly with guidance instead of silently dropping data.
-- ---------------------------------------------------------------------------

do $migration$
declare
  v_conflicts integer;
begin
  with active_appointments as (
    select a.id, a.barber_id, a.starts_at, coalesce(a.busy_until, a.ends_at) as busy_until
    from public.appointments a
    where a.status in ('pending', 'confirmed')
  )
  select count(*) into v_conflicts
  from active_appointments a
  join active_appointments b
    on a.barber_id = b.barber_id
   and a.id < b.id
   and tstzrange(a.starts_at, a.busy_until, '[)') && tstzrange(b.starts_at, b.busy_until, '[)');

  if v_conflicts > 0 then
    raise exception 'Cannot create exclusion constraint: % overlapping active appointments exist. Resolve them manually (no data was modified), then re-apply this migration.', v_conflicts;
  end if;
end;
$migration$;

alter table public.appointments
  add constraint appointments_barber_no_overlap
  exclude using gist (
    barber_id with =,
    tstzrange(starts_at, busy_until, '[)') with &&
  ) where (status in ('pending', 'confirmed'));

-- ---------------------------------------------------------------------------
-- Outbox enqueue trigger. Runs in the same transaction as the appointment
-- mutation, so a booking and its notification jobs commit atomically. Any
-- notification error is swallowed: messaging must never break a booking.
-- ---------------------------------------------------------------------------

create or replace function public.enqueue_appointment_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event text;
  v_channels text[];
  v_ns public.notification_settings%rowtype;
  v_settings public.shop_settings%rowtype;
  v_contacts public.barber_contact_channels%rowtype;
  v_payload jsonb;
begin
  if current_setting('app.suppress_notifications', true) = 'on' then
    return new;
  end if;

  begin
    select * into v_ns from public.notification_settings where id = 1;
    select * into v_settings from public.shop_settings where id = 1;
    select * into v_contacts from public.barber_contact_channels where barber_id = new.barber_id;

    v_channels := coalesce(v_ns.channels, array['telegram', 'whatsapp']);

    if tg_op = 'INSERT' then
      v_event := 'booking_created';
    elsif new.status is distinct from old.status then
      if new.status = 'confirmed' then
        v_event := 'booking_confirmed';
      elsif new.status = 'cancelled' then
        v_event := 'booking_cancelled';
      else
        return new;
      end if;
    elsif new.barber_id is distinct from old.barber_id then
      v_event := 'barber_assignment_changed';
    elsif new.starts_at is distinct from old.starts_at then
      v_event := 'booking_rescheduled';
    else
      return new;
    end if;

    v_payload := jsonb_build_object(
      'event', v_event,
      'booking_code', new.booking_code,
      'customer_name', new.customer_name,
      'service_name', new.service_name_snapshot,
      'price_idr', new.price_idr_snapshot,
      'duration_minutes', new.duration_minutes_snapshot,
      'starts_at', new.starts_at,
      'ends_at', new.ends_at,
      'status', new.status,
      'timezone', coalesce(v_settings.timezone, 'Asia/Jakarta')
    );

    if v_event = 'booking_created' then
      -- The shop/barber needs to action the new request.
      if 'telegram' = any(v_channels) and coalesce(v_contacts.telegram_chat_id, v_ns.admin_telegram_chat_id) is not null then
        insert into public.notification_jobs (appointment_id, event_type, channel, recipient, idempotency_key, payload)
        values (
          new.id, v_event, 'telegram',
          coalesce(v_contacts.telegram_chat_id, v_ns.admin_telegram_chat_id),
          v_event || ':' || new.id::text || ':telegram:barber', v_payload
        ) on conflict (idempotency_key) do nothing;
      end if;
      if 'whatsapp' = any(v_channels) and coalesce(v_contacts.phone_whatsapp, v_settings.phone_whatsapp) is not null then
        insert into public.notification_jobs (appointment_id, event_type, channel, recipient, idempotency_key, payload)
        values (
          new.id, v_event, 'whatsapp',
          coalesce(v_contacts.phone_whatsapp, v_settings.phone_whatsapp),
          v_event || ':' || new.id::text || ':whatsapp:shop', v_payload
        ) on conflict (idempotency_key) do nothing;
      end if;
    else
      -- Lifecycle messages and reminders go to the customer on WhatsApp and
      -- to the responsible barber/admin on Telegram.
      if 'whatsapp' = any(v_channels) then
        insert into public.notification_jobs (appointment_id, event_type, channel, recipient, idempotency_key, payload)
        values (
          new.id, v_event, 'whatsapp', new.customer_phone,
          v_event || ':' || new.id::text || ':whatsapp:customer', v_payload
        ) on conflict (idempotency_key) do nothing;
      end if;
      if 'telegram' = any(v_channels) and coalesce(v_contacts.telegram_chat_id, v_ns.admin_telegram_chat_id) is not null then
        insert into public.notification_jobs (appointment_id, event_type, channel, recipient, idempotency_key, payload)
        values (
          new.id, v_event, 'telegram',
          coalesce(v_contacts.telegram_chat_id, v_ns.admin_telegram_chat_id),
          v_event || ':' || new.id::text || ':telegram:barber', v_payload
        ) on conflict (idempotency_key) do nothing;
      end if;
    end if;
  exception
    when others then
      raise warning 'notification enqueue failed for appointment %: %', new.id, sqlerrm;
  end;

  return new;
end;
$$;

drop trigger if exists appointments_enqueue_notifications on public.appointments;
create trigger appointments_enqueue_notifications
  after insert or update on public.appointments
  for each row execute function public.enqueue_appointment_notifications();

-- ---------------------------------------------------------------------------
-- Worker RPCs. Leased claims use FOR UPDATE SKIP LOCKED so concurrent workers
-- never process the same job, and stale leases are recovered automatically.
-- ---------------------------------------------------------------------------

create or replace function public.claim_notification_jobs(
  p_batch_size integer default 10,
  p_lease interval default interval '5 minutes'
)
returns setof public.notification_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Recover jobs whose worker died while holding a lease.
  update public.notification_jobs
     set status = 'pending', locked_at = null, locked_until = null
   where status = 'processing'
     and locked_until is not null
     and locked_until < now();

  return query
  with picked as (
    select id
    from public.notification_jobs
    where status = 'pending'
      and scheduled_at <= now()
    order by scheduled_at
    limit greatest(1, least(p_batch_size, 50))
    for update skip locked
  )
  update public.notification_jobs j
     set status = 'processing',
         locked_at = now(),
         locked_until = now() + p_lease,
         attempt_count = j.attempt_count + 1,
         updated_at = now()
  from picked
  where j.id = picked.id
  returning j.*;
end;
$$;
revoke all on function public.claim_notification_jobs(integer, interval) from public, anon;
grant execute on function public.claim_notification_jobs(integer, interval) to service_role;

-- Enqueue appointment reminders for the configured lead window. Idempotent:
-- re-running the job never duplicates a reminder because of the unique key.
create or replace function public.enqueue_appointment_reminders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hours integer;
  v_row record;
  v_payload jsonb;
  v_inserted integer;
  v_total integer := 0;
begin
  select reminder_hours into v_hours from public.notification_settings where id = 1;
  v_hours := coalesce(v_hours, 24);

  for v_row in
    select a.*,
           bcc.telegram_chat_id as barber_telegram,
           bcc.phone_whatsapp as barber_wa,
           ns.admin_telegram_chat_id,
           ns.channels,
           s.timezone
    from public.appointments a
    cross join public.notification_settings ns
    join public.shop_settings s on s.id = 1
    left join public.barber_contact_channels bcc on bcc.barber_id = a.barber_id
    where a.status = 'confirmed'
      and a.starts_at > now()
      and a.starts_at <= now() + make_interval(hours => v_hours)
  loop
    v_payload := jsonb_build_object(
      'event', 'appointment_reminder',
      'booking_code', v_row.booking_code,
      'customer_name', v_row.customer_name,
      'service_name', v_row.service_name_snapshot,
      'price_idr', v_row.price_idr_snapshot,
      'duration_minutes', v_row.duration_minutes_snapshot,
      'starts_at', v_row.starts_at,
      'ends_at', v_row.ends_at,
      'status', v_row.status,
      'timezone', coalesce(v_row.timezone, 'Asia/Jakarta')
    );

    if 'whatsapp' = any(v_row.channels) then
      with ins as (
        insert into public.notification_jobs (appointment_id, event_type, channel, recipient, idempotency_key, payload)
        values (
          v_row.id, 'appointment_reminder', 'whatsapp', v_row.customer_phone,
          'appointment_reminder:' || v_row.id::text || ':' || v_hours::text || ':whatsapp:customer', v_payload
        ) on conflict (idempotency_key) do nothing
        returning 1
      ) select count(*) into v_inserted from ins;
      v_total := v_total + v_inserted;
    end if;

    if 'telegram' = any(v_row.channels) and coalesce(v_row.barber_telegram, v_row.admin_telegram_chat_id) is not null then
      with ins as (
        insert into public.notification_jobs (appointment_id, event_type, channel, recipient, idempotency_key, payload)
        values (
          v_row.id, 'appointment_reminder', 'telegram',
          coalesce(v_row.barber_telegram, v_row.admin_telegram_chat_id),
          'appointment_reminder:' || v_row.id::text || ':' || v_hours::text || ':telegram:barber', v_payload
        ) on conflict (idempotency_key) do nothing
        returning 1
      ) select count(*) into v_inserted from ins;
      v_total := v_total + v_inserted;
    end if;
  end loop;

  return v_total;
end;
$$;
revoke all on function public.enqueue_appointment_reminders() from public, anon;
grant execute on function public.enqueue_appointment_reminders() to service_role;

-- Pending bookings that were never confirmed release their slot after the
-- reservation window. The enqueue trigger is explicitly suppressed so expiry
-- does not spam customers; the audit trigger still records the change.
create or replace function public.expire_stale_pending_bookings(
  p_max_age interval default interval '30 minutes'
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  perform set_config('app.suppress_notifications', 'on', true);
  with updated as (
    update public.appointments
       set status = 'cancelled',
           cancelled_at = now(),
           cancellation_reason = coalesce(
             cancellation_reason,
             'Automatically expired after the pending confirmation window.'
           )
     where status = 'pending'
       and created_at < now() - p_max_age
    returning 1
  )
  select count(*) into v_count from updated;
  perform set_config('app.suppress_notifications', 'off', true);
  return v_count;
end;
$$;
revoke all on function public.expire_stale_pending_bookings(interval) from public, anon;
grant execute on function public.expire_stale_pending_bookings(interval) to service_role;
