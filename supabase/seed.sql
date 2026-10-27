-- Local development seed only. `supabase db push` never applies this file; it is
-- loaded by `supabase db reset` / the local stack. All values are synthetic and
-- safe to delete. No Auth users or API credentials are created here: create the
-- first administrator through Supabase Auth, then attach a profile manually
-- (see docs/DATABASE.md). All statements are idempotent.

insert into public.shop_settings (id, shop_name, address, city, timezone, phone_whatsapp,
  opening_hours, booking_notice_minutes, booking_horizon_days,
  customer_cancellation_deadline_minutes, customer_reschedule_deadline_minutes,
  default_buffer_minutes)
values (1, 'Terasbarber (Development)', 'Jl. Contoh No. 1', 'Padang', 'Asia/Jakarta',
  '+6281200000000', '{}'::jsonb, 60, 45, 120, 120, 0)
on conflict (id) do nothing;

insert into public.shop_hours (day_of_week, opens_at, closes_at, is_closed)
values
  (0, '10:00'::time, '18:00'::time, false),
  (1, '09:00'::time, '20:00'::time, false),
  (2, '09:00'::time, '20:00'::time, false),
  (3, '09:00'::time, '20:00'::time, false),
  (4, '09:00'::time, '20:00'::time, false),
  (5, '09:00'::time, '21:00'::time, false),
  (6, '09:00'::time, '21:00'::time, false)
on conflict (day_of_week) do update
  set opens_at = excluded.opens_at, closes_at = excluded.closes_at, is_closed = excluded.is_closed;

insert into public.services (id, name, slug, description, category, duration_minutes, buffer_minutes, price_idr, is_active, sort_order)
values
  ('11111111-1111-4111-8111-111111111111', 'Classic Haircut', 'classic-haircut', 'Precision cut with clipper and scissors, finished with styling.', 'HAIRCUT', 45, 0, 75000, true, 1),
  ('22222222-2222-4222-8222-222222222222', 'Haircut + Beard Trim', 'haircut-beard-trim', 'Full haircut with beard line-up and hot towel finish.', 'COMBO', 60, 15, 110000, true, 2),
  ('33333333-3333-4333-8333-333333333333', 'Beard Sculpting', 'beard-sculpting', 'Shape, line and condition your beard.', 'BEARD', 30, 0, 50000, true, 3)
on conflict (id) do update
  set name = excluded.name, description = excluded.description,
      duration_minutes = excluded.duration_minutes, buffer_minutes = excluded.buffer_minutes,
      price_idr = excluded.price_idr, is_active = excluded.is_active, sort_order = excluded.sort_order;

insert into public.barbers (id, name, slug, bio, specialties, is_active, sort_order)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Raka Pratama', 'raka-pratama', 'Classic cuts and sharp fades.', array['Fade', 'Classic'], true, 1),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Dimas Wijaya', 'dimas-wijaya', 'Beard sculpting and combo packages.', array['Beard', 'Combo'], true, 2)
on conflict (id) do update
  set name = excluded.name, bio = excluded.bio,
      specialties = excluded.specialties, is_active = excluded.is_active, sort_order = excluded.sort_order;

insert into public.barber_services (barber_id, service_id)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '11111111-1111-4111-8111-1111111111111'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '33333333-3333-4333-8333-333333333333')
on conflict do nothing;

insert into public.barber_hours (barber_id, day_of_week, opens_at, closes_at, is_closed)
select b.id, h.day_of_week, h.opens_at, h.closes_at, h.is_closed
from public.barbers b cross join public.shop_hours h
on conflict (barber_id, day_of_week) do update
  set opens_at = excluded.opens_at, closes_at = excluded.closes_at, is_closed = excluded.is_closed;

-- Private example destinations. Replace with real test chat ids/numbers.
insert into public.barber_contact_channels (barber_id, phone_whatsapp, telegram_chat_id)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '+6281200000001', '123456789')
on conflict (barber_id) do update
  set phone_whatsapp = excluded.phone_whatsapp,
      telegram_chat_id = excluded.telegram_chat_id;

insert into public.notification_settings (id, admin_telegram_chat_id, channels, reminder_hours)
values (1, null, array['telegram', 'whatsapp'], 24)
on conflict (id) do nothing;
