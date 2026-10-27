begin;
select plan(45);

-- Isolated fixture data inside this transaction; rollback below leaves the project clean.
insert into public.services (name, slug, description, duration_minutes, price_idr, is_active)
values ('Database test cut', 'db-test-cut', 'Test-only service', 45, 25000, true)
on conflict (slug) do update set is_active = true;
insert into public.services (name, slug, description, duration_minutes, buffer_minutes, price_idr, is_active)
values ('Database buffer cut', 'db-test-buffer', 'Buffered test service', 30, 15, 40000, true)
on conflict (slug) do update set is_active = true, buffer_minutes = 15;
insert into public.barbers (name, slug, is_active)
values ('Database test barber', 'db-test-barber', true)
on conflict (slug) do update set is_active = true;
insert into public.barbers (name, slug, is_active)
values ('Database buffer barber', 'db-test-buffer-barber', true)
on conflict (slug) do update set is_active = true;
insert into public.barber_services (barber_id, service_id)
select b.id, s.id from public.barbers b cross join public.services s
where b.slug = 'db-test-barber' and s.slug = 'db-test-cut' on conflict do nothing;
insert into public.barber_services (barber_id, service_id)
select b.id, s.id from public.barbers b cross join public.services s
where b.slug = 'db-test-buffer-barber' and s.slug = 'db-test-buffer' on conflict do nothing;
insert into public.shop_hours (day_of_week, opens_at, closes_at, is_closed)
select day, '09:00'::time, '20:00'::time, false from generate_series(0, 6) day
on conflict (day_of_week) do update set opens_at = excluded.opens_at, closes_at = excluded.closes_at, is_closed = false;
update public.shop_settings set timezone = 'Asia/Jakarta', booking_notice_minutes = 0, booking_horizon_days = 60 where id = 1;
-- Private notification destination used by the outbox assertions.
insert into public.barber_contact_channels (barber_id, phone_whatsapp, telegram_chat_id)
select b.id, '+6281200000099', '555444333' from public.barbers b where b.slug = 'db-test-barber'
on conflict (barber_id) do update set phone_whatsapp = excluded.phone_whatsapp, telegram_chat_id = excluded.telegram_chat_id;

set local role anon;
select ok(not has_table_privilege('anon', 'public.appointments', 'select'), 'anonymous clients cannot read appointment/PII rows');
select ok(not has_table_privilege('anon', 'public.barber_contact_channels', 'select'), 'anonymous clients cannot read private barber WhatsApp contacts');
select ok(not has_table_privilege('anon', 'public.notification_jobs', 'select'), 'anonymous clients cannot read notification jobs');
select ok(not has_table_privilege('anon', 'public.notification_logs', 'select'), 'anonymous clients cannot read notification delivery logs');
select ok(not has_table_privilege('anon', 'public.barber_time_off', 'select'), 'anonymous clients cannot read barber time-off records');
select ok(not has_table_privilege('anon', 'public.notification_settings', 'select'), 'anonymous clients cannot read private notification settings');
select ok(not has_function_privilege('anon', 'public.create_public_booking(uuid,uuid,timestamptz,text,text,text,text,text)', 'execute'), 'anonymous clients cannot call the protected booking RPC directly');
select ok(not has_function_privilege('anon', 'public.claim_notification_jobs(integer,interval)', 'execute'), 'anonymous clients cannot claim notification jobs');
select is(public.is_admin(), false, 'anonymous database role is not an administrator');
select ok(exists (
  select 1 from public.get_public_availability(
    (now() at time zone 'Asia/Jakarta')::date + 1,
    (select id from public.services where slug = 'db-test-cut'), null
  )
), 'configured public availability includes a no-collision test slot');

set local role service_role;
select lives_ok($test$
  select * from public.create_public_booking(
    (select id from public.services where slug = 'db-test-cut'),
    (select id from public.barbers where slug = 'db-test-barber'),
    (((now() at time zone 'Asia/Jakarta')::date + 1) + time '12:00') at time zone 'Asia/Jakarta',
    'DB Test Guest', '+6281200000023', null, repeat('a', 64)
  )
$test$, 'public booking can be saved through the guarded RPC');
select is((select barber_id::text from public.appointments where customer_phone = '+6281200000023' order by created_at desc limit 1), (select id::text from public.barbers where slug = 'db-test-barber'), 'the appointment remains assigned to the selected barber');

select throws_ok($test$
  select * from public.create_public_booking(
    (select id from public.services where slug = 'db-test-cut'),
    (select id from public.barbers where slug = 'db-test-barber'),
    (((now() at time zone 'Asia/Jakarta')::date + 1) + time '12:00') at time zone 'Asia/Jakarta',
    'DB Test Guest', '+6281200000023', null, repeat('a', 64)
  )
$test$, 'P0001', 'booking_slot_taken', 'simultaneous/duplicate reservations for an occupied barber interval are rejected');

select lives_ok($test$
  select * from public.create_public_booking_managed(
    (select id from public.services where slug = 'db-test-cut'),
    (select id from public.barbers where slug = 'db-test-barber'),
    (((now() at time zone 'Asia/Jakarta')::date + 1) + time '13:00') at time zone 'Asia/Jakarta',
    'Managed Test Guest', '+6281200000024', null, repeat('b', 64), repeat('c', 64)
  )
$test$, 'managed booking creation and token persistence are atomic');
select is((select count(*)::integer from public.appointment_manage_tokens where token_hash = repeat('c', 64)), 1, 'only a hash of the management token is stored');
select is((select a.service_name_snapshot from public.appointments a join public.appointment_manage_tokens t on t.appointment_id = a.id where t.token_hash = repeat('c', 64)), 'Database test cut', 'booking preserves its service-name snapshot');
select ok((select a.price_idr_snapshot = 25000 and a.duration_minutes_snapshot = 45 from public.appointments a join public.appointment_manage_tokens t on t.appointment_id = a.id where t.token_hash = repeat('c', 64)), 'booking preserves price and duration snapshots');
select lives_ok($test$
  select * from public.manage_public_booking(
    repeat('c', 64), 'reschedule',
    (((now() at time zone 'Asia/Jakarta')::date + 1) + time '14:00') at time zone 'Asia/Jakarta', null
  )
$test$, 'a valid management token can atomically reschedule a booking');
select is((select a.starts_at from public.appointments a join public.appointment_manage_tokens t on t.appointment_id = a.id where t.token_hash = repeat('c', 64)), (((now() at time zone 'Asia/Jakarta')::date + 1) + time '14:00') at time zone 'Asia/Jakarta', 'reschedule persists the new start time');
select lives_ok($test$ select * from public.manage_public_booking(repeat('c', 64), 'cancel', null, 'Plans changed') $test$, 'a valid management token can cancel an eligible booking');
select is((select a.status from public.appointments a join public.appointment_manage_tokens t on t.appointment_id = a.id where t.token_hash = repeat('c', 64)), 'cancelled', 'cancellation status is persisted');
select is((select count(*)::integer from public.booking_audit_logs l join public.appointment_manage_tokens t on t.appointment_id = l.appointment_id where t.token_hash = repeat('c', 64)), 3, 'creation, rescheduling, and cancellation are audited');
select throws_ok($test$ select * from public.manage_public_booking(repeat('d', 64), 'view', null, null) $test$, 'P0001', 'manage_token_invalid', 'unknown management tokens do not reveal booking data');

-- Hard overlap guarantee and buffer handling.
select ok(exists (
  select 1 from pg_constraint where conname = 'appointments_barber_no_overlap'
), 'the partial GiST exclusion constraint for barber overlap exists');

select lives_ok($test$
  select * from public.create_public_booking(
    (select id from public.services where slug = 'db-test-buffer'),
    (select id from public.barbers where slug = 'db-test-buffer-barber'),
    (((now() at time zone 'Asia/Jakarta')::date + 1) + time '16:00') at time zone 'Asia/Jakarta',
    'Buffer Guest', '+6281200000031', null, repeat('e', 64), repeat('f', 32)
  )
$test$, 'a buffered booking is saved and stores a buffer-aware busy range');
select is((select busy_until > ends_at from public.appointments where customer_phone = '+6281200000031'), true, 'busy_until includes the service buffer');
select throws_ok($test$
  select * from public.create_public_booking(
    (select id from public.services where slug = 'db-test-buffer'),
    (select id from public.barbers where slug = 'db-test-buffer-barber'),
    (((now() at time zone 'Asia/Jakarta')::date + 1) + time '16:30') at time zone 'Asia/Jakarta',
    'Buffer Collision', '+6281200000032', null, repeat('1', 64)
  )
$test$, 'P0001', 'booking_slot_taken', 'the buffer window blocks an overlapping booking');
select lives_ok($test$
  select * from public.create_public_booking(
    (select id from public.services where slug = 'db-test-buffer'),
    (select id from public.barbers where slug = 'db-test-buffer-barber'),
    (((now() at time zone 'Asia/Jakarta')::date + 1) + time '16:45') at time zone 'Asia/Jakarta',
    'Buffer Back To Back', '+6281200000033', null, repeat('2', 64)
  )
$test$, 'half-open ranges allow a booking exactly when the buffered slot ends');

-- Barber time off blocks the slot in the guarded RPC.
insert into public.barber_time_off (barber_id, start_at, end_at, reason)
select b.id,
  (((now() at time zone 'Asia/Jakarta')::date + 1) + time '17:00') at time zone 'Asia/Jakarta',
  (((now() at time zone 'Asia/Jakarta')::date + 1) + time '18:00') at time zone 'Asia/Jakarta',
  'Test leave'
from public.barbers b where b.slug = 'db-test-buffer-barber';
select throws_ok($test$
  select * from public.create_public_booking(
    (select id from public.services where slug = 'db-test-buffer'),
    (select id from public.barbers where slug = 'db-test-buffer-barber'),
    (((now() at time zone 'Asia/Jakarta')::date + 1) + time '17:15') at time zone 'Asia/Jakarta',
    'Time Off Guest', '+6281200000034', null, repeat('3', 64)
  )
$test$, 'P0001', 'booking_slot_taken', 'bookings inside barber time off are rejected');

-- Idempotent submission replays the original booking.
select lives_ok($test$
  select * from public.create_public_booking(
    (select id from public.services where slug = 'db-test-cut'),
    (select id from public.barbers where slug = 'db-test-barber'),
    (((now() at time zone 'Asia/Jakarta')::date + 1) + time '15:00') at time zone 'Asia/Jakarta',
    'Idempotent Guest', '+6281200000041', null, repeat('4', 64), repeat('7', 40)
  )
$test$, 'first idempotent booking request is accepted');
select is((select count(*)::integer from public.appointments where idempotency_key = repeat('7', 40)), 1, 'the idempotency key is stored once');
select lives_ok($test$
  select * from public.create_public_booking(
    (select id from public.services where slug = 'db-test-cut'),
    (select id from public.barbers where slug = 'db-test-barber'),
    (((now() at time zone 'Asia/Jakarta')::date + 1) + time '15:00') at time zone 'Asia/Jakarta',
    'Idempotent Guest Retry', '+6281200000042', null, repeat('5', 64), repeat('7', 40)
  )
$test$, 'a retried request with the same idempotency key is accepted');
select is((select count(*)::integer from public.appointments where idempotency_key = repeat('7', 40)), 1, 'retried idempotent requests do not create duplicate appointments');

-- Transactional outbox: booking and notification jobs commit together.
select is((select count(*)::integer from public.notification_jobs j
  join public.appointments a on a.id = j.appointment_id
  where a.customer_phone = '+6281200000023'), 2, 'booking creation enqueues telegram and whatsapp outbox jobs');
select ok((select bool_and(status = 'pending') from public.notification_jobs j
  join public.appointments a on a.id = j.appointment_id
  where a.customer_phone = '+6281200000023'), 'new outbox jobs start in pending state');

-- Leased claim with SKIP LOCKED semantics and stale-lease recovery.
insert into public.notification_jobs (id, appointment_id, event_type, channel, recipient, idempotency_key, status, scheduled_at)
select '60000000-0000-4000-8000-000000000001', a.id, 'booking_confirmed', 'telegram', '555000111',
  'test:fresh-job', 'pending', now()
from public.appointments a where a.customer_phone = '+6281200000023';
insert into public.notification_jobs (id, appointment_id, event_type, channel, recipient, idempotency_key, status, locked_at, locked_until, attempt_count)
select '60000000-0000-4000-8000-000000000002', a.id, 'booking_confirmed', 'whatsapp', '+6281200000023',
  'test:stale-lease', 'processing', now() - interval '2 hours', now() - interval '1 hour', 3
from public.appointments a where a.customer_phone = '+6281200000023';
select is((select status from public.claim_notification_jobs(50, interval '5 minutes') where id = '60000000-0000-4000-8000-000000000001'), 'processing', 'claim marks a pending job as processing');
select is((select attempt_count from public.notification_jobs where id = '60000000-0000-4000-8000-000000000001'), 1, 'claim increments the attempt count');
select is((select status from public.notification_jobs where id = '60000000-0000-4000-8000-000000000002'), 'processing', 'stale leases are recovered and reclaimed');
select is((select attempt_count from public.notification_jobs where id = '60000000-0000-4000-8000-000000000002'), 4, 'reclaimed jobs keep their attempt history');
select is((select count(*)::integer from public.claim_notification_jobs(50, interval '5 minutes') where id in ('60000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000002')), 0, 'already-leased jobs are not handed out to another worker');

-- Reminder enqueue is idempotent and only targets confirmed appointments.
insert into public.appointments (
  booking_code, customer_name, customer_phone, service_id, barber_id, starts_at, ends_at, status
)
values (
  'REMINDER1', 'Reminder Guest', '+6281200000051',
  (select id from public.services where slug = 'db-test-cut'),
  (select id from public.barbers where slug = 'db-test-barber'),
  now() + interval '2 hours', now() + interval '2 hours 45 minutes', 'confirmed'
);
select ok(public.enqueue_appointment_reminders() >= 1, 'upcoming confirmed appointments get reminder jobs');
select is(public.enqueue_appointment_reminders(), 0, 'reminder enqueue is idempotent on repeated runs');

-- Pending expiry releases stale slots and suppresses lifecycle notifications.
insert into public.appointments (
  booking_code, customer_name, customer_phone, service_id, barber_id, starts_at, ends_at, status, created_at
)
values (
  'EXPIRED1', 'Expired Guest', '+6281200000061',
  (select id from public.services where slug = 'db-test-cut'),
  (select id from public.barbers where slug = 'db-test-barber'),
  now() + interval '1 day', now() + interval '1 day 45 minutes', 'pending', now() - interval '45 minutes'
);
select ok(public.expire_stale_pending_bookings(interval '30 minutes') >= 1, 'stale pending bookings are expired by the maintenance job');
select is((select status from public.appointments where booking_code = 'EXPIRED1'), 'cancelled', 'expired pending bookings release their slot');
select is((select count(*)::integer from public.notification_jobs j
  join public.appointments a on a.id = j.appointment_id
  where a.booking_code = 'EXPIRED1' and j.event_type = 'booking_cancelled'), 0, 'system expiry does not spam customers with cancellation messages');

select * from finish();
rollback;
