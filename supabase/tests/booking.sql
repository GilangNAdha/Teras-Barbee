begin;
select plan(18);

-- Isolated fixture data inside this transaction; rollback below leaves the project clean.
insert into public.services (name, slug, description, duration_minutes, price_idr, is_active)
values ('Database test cut', 'db-test-cut', 'Test-only service', 45, 25000, true)
on conflict (slug) do update set is_active = true;
insert into public.barbers (name, slug, is_active)
values ('Database test barber', 'db-test-barber', true)
on conflict (slug) do update set is_active = true;
insert into public.barber_services (barber_id, service_id)
select b.id, s.id from public.barbers b cross join public.services s
where b.slug = 'db-test-barber' and s.slug = 'db-test-cut' on conflict do nothing;
insert into public.shop_hours (day_of_week, opens_at, closes_at, is_closed)
select day, '09:00'::time, '20:00'::time, false from generate_series(0, 6) day
on conflict (day_of_week) do update set opens_at = excluded.opens_at, closes_at = excluded.closes_at, is_closed = false;
update public.shop_settings set timezone = 'Asia/Jakarta', booking_notice_minutes = 0, booking_horizon_days = 60 where id = 1;

set local role anon;
select ok(not has_table_privilege('anon', 'public.appointments', 'select'), 'anonymous clients cannot read appointment/PII rows');
select ok(not has_table_privilege('anon', 'public.barber_contact_channels', 'select'), 'anonymous clients cannot read private barber WhatsApp contacts');
select ok(not has_function_privilege('anon', 'public.create_public_booking(uuid,uuid,timestamptz,text,text,text,text)', 'execute'), 'anonymous clients cannot call the protected booking RPC directly');
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

select * from finish();
rollback;
