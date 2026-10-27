begin;
select plan(8);

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

select * from finish();
rollback;
