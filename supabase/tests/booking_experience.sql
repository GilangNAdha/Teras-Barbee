begin;
select plan(25);

-- All fixture data is rolled back. No production services or customers are seeded.
insert into public.services (name, slug, duration_minutes, price_idr, is_active)
values ('Experience test cut', 'experience-test-cut', 45, 40000, true),
       ('Experience test beard', 'experience-test-beard', 30, 20000, true);
insert into public.barbers (name, slug, sort_order, is_active)
values ('Experience test barber', 'experience-test-barber', 1, true),
       ('Experience partial barber', 'experience-partial-barber', 2, true);
insert into public.barber_services (barber_id, service_id)
select b.id, s.id from public.barbers b cross join public.services s
where (b.slug = 'experience-test-barber' and s.slug in ('experience-test-cut', 'experience-test-beard'))
   or (b.slug = 'experience-partial-barber' and s.slug = 'experience-test-cut');
insert into public.shop_hours (day_of_week, opens_at, closes_at, is_closed)
select day, '09:00'::time, '20:00'::time, false from generate_series(0, 6) day
on conflict (day_of_week) do update set opens_at = excluded.opens_at, closes_at = excluded.closes_at, is_closed = false;
update public.shop_settings set timezone = 'Asia/Jakarta', booking_notice_minutes = 0, booking_horizon_days = 60,
  customer_reschedule_deadline_minutes = 0 where id = 1;

set local role anon;
select ok(not has_table_privilege('anon', 'public.appointment_services', 'select'), 'anonymous clients cannot read appointment line items');
select ok(not has_function_privilege('anon', 'public.create_booking_request(uuid[],uuid,timestamptz,text,text,text,text,text,uuid,integer,integer)', 'execute'), 'booking creation is server-only');
select ok(not has_function_privilege('anon', 'public.get_managed_booking_slots(text,date)', 'execute'), 'managed availability requires a private token and server role');
select is((select count(distinct barber_id)::integer from public.get_booking_slots(
  (now() at time zone 'Asia/Jakarta')::date + 1,
  array[(select id from public.services where slug = 'experience-test-cut'), (select id from public.services where slug = 'experience-test-beard')], null
)), 1, 'only a barber assigned to every selected service is offered');
select ok((select is_available from public.get_booking_calendar(
  (now() at time zone 'Asia/Jakarta')::date + 1, (now() at time zone 'Asia/Jakarta')::date + 1,
  array[(select id from public.services where slug = 'experience-test-cut'), (select id from public.services where slug = 'experience-test-beard')], null
)), 'calendar enables a date with a real opening');
select ok(not (select is_available from public.get_booking_calendar(
  (now() at time zone 'Asia/Jakarta')::date + 61, (now() at time zone 'Asia/Jakarta')::date + 61,
  array[(select id from public.services where slug = 'experience-test-cut')], null
)), 'calendar disables dates outside the booking horizon');

set local role service_role;
select lives_ok($test$
  select * from public.create_booking_request(
    array[(select id from public.services where slug = 'experience-test-cut'), (select id from public.services where slug = 'experience-test-beard')],
    null, (((now() at time zone 'Asia/Jakarta')::date + 1) + time '12:00') at time zone 'Asia/Jakarta',
    'Experience Test Guest', '+6281200000023', null, repeat('a',64), repeat('b',64),
    'f1a2a3a4-1111-4111-8111-111111111111', 60000, 75)
$test$, 'multiple services and a management token are saved atomically');
select is((select count(*)::integer from public.appointment_services i join public.appointments a on a.id = i.appointment_id where a.booking_request_id = 'f1a2a3a4-1111-4111-8111-111111111111'), 2, 'both service line items are preserved');
select ok((select service_name_snapshot = 'Experience test cut + Experience test beard' and price_idr_snapshot = 60000 and duration_minutes_snapshot = 75 from public.appointments where booking_request_id = 'f1a2a3a4-1111-4111-8111-111111111111'), 'appointment stores the complete name, price and duration snapshots');
select is((select extract(epoch from ends_at - starts_at)::integer from public.appointments where booking_request_id = 'f1a2a3a4-1111-4111-8111-111111111111'), 4500, 'the reserved interval covers the combined duration');
select ok(not (select is_available from public.get_booking_slots(
  (now() at time zone 'Asia/Jakarta')::date + 1,
  array[(select id from public.services where slug = 'experience-test-cut'), (select id from public.services where slug = 'experience-test-beard')],
  (select id from public.barbers where slug = 'experience-test-barber')
) where starts_at = (((now() at time zone 'Asia/Jakarta')::date + 1) + time '13:00') at time zone 'Asia/Jakarta'), 'overlapping starts are disabled');
select ok((select is_available from public.get_booking_slots(
  (now() at time zone 'Asia/Jakarta')::date + 1,
  array[(select id from public.services where slug = 'experience-test-cut'), (select id from public.services where slug = 'experience-test-beard')],
  (select id from public.barbers where slug = 'experience-test-barber')
) where starts_at = (((now() at time zone 'Asia/Jakarta')::date + 1) + time '13:30') at time zone 'Asia/Jakarta'), 'the next non-overlapping start is available');
select lives_ok($test$
  select * from public.create_booking_request(
    array[(select id from public.services where slug = 'experience-test-cut'), (select id from public.services where slug = 'experience-test-beard')],
    null, (((now() at time zone 'Asia/Jakarta')::date + 1) + time '12:00') at time zone 'Asia/Jakarta',
    'Experience Test Guest', '+6281200000023', null, repeat('a',64), repeat('b',64),
    'f1a2a3a4-1111-4111-8111-111111111111', 60000, 75)
$test$, 'retrying the same request returns the original booking');
select is((select count(*)::integer from public.appointments where booking_request_id = 'f1a2a3a4-1111-4111-8111-111111111111'), 1, 'a retry cannot create a second appointment');
select throws_ok($test$
  select * from public.create_booking_request(
    array[(select id from public.services where slug = 'experience-test-cut')], null,
    (((now() at time zone 'Asia/Jakarta')::date + 1) + time '12:00') at time zone 'Asia/Jakarta',
    'Experience Test Guest', '+6281200000023', null, repeat('a',64), repeat('c',64),
    'f1a2a3a4-1111-4111-8111-111111111111', 40000, 45)
$test$, 'P0001', 'invalid_booking_request', 'a retry must match the management capability');
select throws_ok($test$
  select * from public.create_booking_request(
    array[(select id from public.services where slug = 'experience-test-cut')], null,
    (((now() at time zone 'Asia/Jakarta')::date + 1) + time '15:00') at time zone 'Asia/Jakarta',
    'Experience Test Guest', '+6281200000023', null, repeat('d',64), repeat('e',64),
    'f1a2a3a4-2222-4222-8222-222222222222', 1, 45)
$test$, 'P0001', 'service_details_changed', 'a changed price is rejected before the appointment is saved');
select ok((select is_available from public.get_managed_booking_slots(repeat('b',64), (now() at time zone 'Asia/Jakarta')::date + 1)
  where starts_at = (((now() at time zone 'Asia/Jakarta')::date + 1) + time '12:00') at time zone 'Asia/Jakarta'), 'management availability excludes the customer’s own appointment');
select lives_ok($test$
  select * from public.manage_public_booking(repeat('b',64), 'reschedule',
    (((now() at time zone 'Asia/Jakarta')::date + 1) + time '15:00') at time zone 'Asia/Jakarta', null)
$test$, 'a multi-service appointment can be rescheduled');
select is((select extract(epoch from ends_at - starts_at)::integer from public.appointments where booking_request_id = 'f1a2a3a4-1111-4111-8111-111111111111'), 4500, 'rescheduling keeps the saved combined duration');
select ok((select changed_fields ? 'service_ids' from public.booking_audit_logs l join public.appointments a on a.id = l.appointment_id where a.booking_request_id = 'f1a2a3a4-1111-4111-8111-111111111111' and l.action = 'created'), 'the audit record includes all selected services');
reset role;
update public.services set is_active = false where slug = 'experience-test-beard';
set local role service_role;
select throws_ok($test$
  select * from public.manage_public_booking(repeat('b',64), 'reschedule',
    (((now() at time zone 'Asia/Jakarta')::date + 1) + time '16:30') at time zone 'Asia/Jakarta', null)
$test$, 'P0001', 'service_unavailable', 'rescheduling rechecks every selected service');

-- An expired pending request no longer holds a chair and must not claim that a
-- new time was reserved successfully. The customer can make a fresh request.
reset role;
update public.services set is_active = true where slug = 'experience-test-beard';
update public.appointments set created_at = now() - interval '31 minutes' where booking_request_id = 'f1a2a3a4-1111-4111-8111-111111111111';
set local role service_role;
select ok(not (select can_reschedule from public.manage_public_booking(repeat('b',64), 'view', null, null)), 'an expired pending hold cannot be rescheduled');
select is((select count(*)::integer from public.get_managed_booking_slots(repeat('b',64), (now() at time zone 'Asia/Jakarta')::date + 1)), 0, 'no managed slots are offered for an expired hold');
select throws_ok($test$
  select * from public.manage_public_booking(repeat('b',64), 'reschedule',
    (((now() at time zone 'Asia/Jakarta')::date + 1) + time '16:30') at time zone 'Asia/Jakarta', null)
$test$, 'P0001', 'booking_hold_expired', 'an expired request cannot silently claim a new hold');
select is((select a.starts_at from public.appointments a where a.booking_request_id = 'f1a2a3a4-1111-4111-8111-111111111111'),
  (((now() at time zone 'Asia/Jakarta')::date + 1) + time '15:00') at time zone 'Asia/Jakarta', 'rejecting an expired reschedule keeps the prior appointment unchanged');

select * from finish();
rollback;
