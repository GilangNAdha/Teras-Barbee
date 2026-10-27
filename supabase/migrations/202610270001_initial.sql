create extension if not exists pgcrypto with schema extensions;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'barber' check (role in ('admin', 'barber')),
  full_name text,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public, auth
as $$ select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'); $$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

create table public.services (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 2 and 80),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description text not null default '' check (length(description) <= 500),
  category text not null default 'HAIRCUT' check (category in ('HAIRCUT', 'COMBO', 'BEARD')),
  duration_minutes integer not null check (duration_minutes between 10 and 300),
  price_idr integer not null check (price_idr between 0 and 100000000),
  image_url text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.barbers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 2 and 80),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  bio text not null default '' check (length(bio) <= 1000),
  specialties text[] not null default '{}',
  portrait_url text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.barber_services (
  barber_id uuid not null references public.barbers(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  primary key (barber_id, service_id)
);

create table public.gallery_images (
  id uuid primary key default gen_random_uuid(),
  storage_path text not null unique,
  alt_text text not null check (length(alt_text) between 5 and 240),
  category text check (category is null or length(category) <= 60),
  sort_order integer not null default 0,
  is_visible boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.shop_settings (
  id integer primary key default 1 check (id = 1),
  shop_name text not null default 'Terasbarber',
  address text,
  city text,
  timezone text not null default 'Asia/Jakarta',
  phone_whatsapp text,
  instagram_url text,
  opening_hours jsonb not null default '{}'::jsonb,
  booking_notice_minutes integer not null default 60 check (booking_notice_minutes between 0 and 10080),
  booking_horizon_days integer not null default 45 check (booking_horizon_days between 1 and 180),
  updated_at timestamptz not null default now()
);
insert into public.shop_settings (id) values (1) on conflict do nothing;

create table public.shop_hours (
  day_of_week smallint primary key check (day_of_week between 0 and 6),
  opens_at time,
  closes_at time,
  is_closed boolean not null default true,
  check ((is_closed and opens_at is null and closes_at is null) or (not is_closed and opens_at is not null and closes_at is not null and closes_at > opens_at))
);

create table public.barber_hours (
  barber_id uuid not null references public.barbers(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  opens_at time,
  closes_at time,
  is_closed boolean not null default true,
  primary key (barber_id, day_of_week),
  check ((is_closed and opens_at is null and closes_at is null) or (not is_closed and opens_at is not null and closes_at is not null and closes_at > opens_at))
);

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  booking_code text not null unique,
  customer_name text not null check (length(customer_name) between 2 and 80),
  customer_phone text not null check (length(customer_phone) between 8 and 24),
  service_id uuid not null references public.services(id) on delete restrict,
  barber_id uuid not null references public.barbers(id) on delete restrict,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled', 'completed', 'no_show')),
  notes text check (notes is null or length(notes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index appointments_barber_start_idx on public.appointments (barber_id, starts_at) where status in ('pending', 'confirmed');
create index appointments_created_idx on public.appointments (created_at desc);

create table public.booking_rate_limits (
  id bigint generated always as identity primary key,
  client_hash text not null,
  created_at timestamptz not null default now()
);
create index booking_rate_limits_client_created_idx on public.booking_rate_limits (client_hash, created_at desc);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
create trigger services_touch_updated before update on public.services for each row execute function public.touch_updated_at();
create trigger barbers_touch_updated before update on public.barbers for each row execute function public.touch_updated_at();
create trigger settings_touch_updated before update on public.shop_settings for each row execute function public.touch_updated_at();
create trigger appointments_touch_updated before update on public.appointments for each row execute function public.touch_updated_at();

alter table public.profiles enable row level security;
alter table public.services enable row level security;
alter table public.barbers enable row level security;
alter table public.barber_services enable row level security;
alter table public.gallery_images enable row level security;
alter table public.shop_settings enable row level security;
alter table public.shop_hours enable row level security;
alter table public.barber_hours enable row level security;
alter table public.appointments enable row level security;
alter table public.booking_rate_limits enable row level security;

grant select on public.services, public.barbers, public.barber_services, public.gallery_images, public.shop_settings, public.shop_hours, public.barber_hours to anon, authenticated;
grant select, insert, update, delete on public.services, public.barbers, public.barber_services, public.gallery_images, public.shop_settings, public.shop_hours, public.barber_hours to authenticated;
grant select on public.profiles to authenticated;
grant select, update on public.appointments to authenticated;
grant usage, select on sequence public.booking_rate_limits_id_seq to service_role;

create policy "Public reads active services" on public.services for select to anon, authenticated using (is_active or public.is_admin());
create policy "Admins manage services" on public.services for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Public reads active barbers" on public.barbers for select to anon, authenticated using (is_active or public.is_admin());
create policy "Admins manage barbers" on public.barbers for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Public reads active barber services" on public.barber_services for select to anon, authenticated using (
  exists (select 1 from public.barbers b where b.id = barber_id and b.is_active)
  and exists (select 1 from public.services s where s.id = service_id and s.is_active)
);
create policy "Admins manage barber services" on public.barber_services for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Public reads visible gallery" on public.gallery_images for select to anon, authenticated using (is_visible or public.is_admin());
create policy "Admins manage gallery" on public.gallery_images for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Public reads shop settings" on public.shop_settings for select to anon, authenticated using (true);
create policy "Admins manage settings" on public.shop_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Public reads shop hours" on public.shop_hours for select to anon, authenticated using (true);
create policy "Admins manage shop hours" on public.shop_hours for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Public reads barber hours" on public.barber_hours for select to anon, authenticated using (true);
create policy "Admins manage barber hours" on public.barber_hours for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Admins read appointments" on public.appointments for select to authenticated using (public.is_admin());
create policy "Admins manage appointments" on public.appointments for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Users read own profile" on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());
create policy "Admins manage profiles" on public.profiles for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Public availability is read-only; customer PII is never exposed by this function.
create or replace function public.get_public_availability(p_date date, p_service_id uuid, p_barber_id uuid default null)
returns table (starts_at timestamptz, barber_id uuid, barber_name text)
language plpgsql stable security definer set search_path = public, extensions
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
begin
  select * into v_service from public.services where id = p_service_id and is_active;
  if not found then raise exception 'service_unavailable' using errcode = 'P0001'; end if;
  select * into v_settings from public.shop_settings where id = 1;
  if not found then raise exception 'shop_not_configured' using errcode = 'P0001'; end if;
  if p_date < (now() at time zone v_settings.timezone)::date or p_date > ((now() at time zone v_settings.timezone)::date + v_settings.booking_horizon_days) then
    return;
  end if;
  v_dow := extract(dow from p_date)::integer;
  select * into v_shop from public.shop_hours where day_of_week = v_dow and not is_closed;
  if not found then return; end if;

  for v_barber in
    select b.id, b.name from public.barbers b
    join public.barber_services bs on bs.barber_id = b.id and bs.service_id = v_service.id
    where b.is_active and (p_barber_id is null or b.id = p_barber_id)
    order by b.sort_order, b.name
  loop
    v_open := v_shop.opens_at;
    v_close := v_shop.closes_at;
    select * into v_barber_hours from public.barber_hours where barber_hours.barber_id = v_barber.id and day_of_week = v_dow;
    v_has_barber_hours := found;
    if v_has_barber_hours then
      if v_barber_hours.is_closed then continue; end if;
      v_open := greatest(v_open, v_barber_hours.opens_at);
      v_close := least(v_close, v_barber_hours.closes_at);
    end if;
    if v_close <= v_open then continue; end if;

    for v_local_slot in
      select generate_series(p_date + v_open, p_date + v_close - make_interval(mins => v_service.duration_minutes), interval '30 minutes')
    loop
      v_start := v_local_slot at time zone v_settings.timezone;
      v_end := v_start + make_interval(mins => v_service.duration_minutes);
      if v_start < now() + make_interval(mins => v_settings.booking_notice_minutes) then continue; end if;
      if exists (select 1 from public.appointments a where a.barber_id = v_barber.id and a.status in ('pending','confirmed') and (a.status = 'confirmed' or a.created_at > now() - interval '30 minutes') and a.starts_at < v_end and a.ends_at > v_start) then continue; end if;
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

create or replace function public.create_public_booking(
  p_service_id uuid, p_barber_id uuid, p_starts_at timestamptz, p_customer_name text,
  p_customer_phone text, p_notes text, p_client_hash text
)
returns table (appointment_id uuid, booking_code text, barber_name text, service_name text, starts_at timestamptz)
language plpgsql security definer set search_path = public, extensions
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
  v_open time;
  v_close time;
  v_barber_hours public.barber_hours%rowtype;
  v_has_barber_hours boolean;
  v_code text;
  v_rate_count integer;
begin
  if length(trim(p_customer_name)) not between 2 and 80 or length(trim(p_customer_phone)) not between 8 and 24 or length(coalesce(p_notes,'')) > 500 then
    raise exception 'invalid_customer_details' using errcode = 'P0001';
  end if;
  if p_client_hash !~ '^[a-f0-9]{64}$' then raise exception 'invalid_rate_key' using errcode = 'P0001'; end if;

  perform pg_advisory_xact_lock(hashtextextended('booking-rate:' || p_client_hash, 0));
  delete from public.booking_rate_limits where created_at < now() - interval '1 day';
  select count(*) into v_rate_count from public.booking_rate_limits where client_hash = p_client_hash and created_at > now() - interval '15 minutes';
  if v_rate_count >= 5 then raise exception 'booking_rate_limited' using errcode = 'P0001'; end if;
  insert into public.booking_rate_limits (client_hash) values (p_client_hash);

  select * into v_service from public.services where id = p_service_id and is_active;
  if not found then raise exception 'service_unavailable' using errcode = 'P0001'; end if;
  select * into v_settings from public.shop_settings where id = 1;
  if not found then raise exception 'shop_not_configured' using errcode = 'P0001'; end if;
  v_local_start := p_starts_at at time zone v_settings.timezone;
  v_local_date := v_local_start::date;
  v_dow := extract(dow from v_local_date)::integer;
  if p_starts_at <= now() + make_interval(mins => v_settings.booking_notice_minutes) or v_local_date > ((now() at time zone v_settings.timezone)::date + v_settings.booking_horizon_days) then
    raise exception 'booking_out_of_range' using errcode = 'P0001';
  end if;
  select * into v_shop from public.shop_hours where day_of_week = v_dow and not is_closed;
  if not found then raise exception 'shop_closed' using errcode = 'P0001'; end if;
  v_end := p_starts_at + make_interval(mins => v_service.duration_minutes);

  for v_barber in
    select b.id, b.name from public.barbers b
    join public.barber_services bs on bs.barber_id = b.id and bs.service_id = v_service.id
    where b.is_active and (p_barber_id is null or b.id = p_barber_id)
    order by b.sort_order, b.name
  loop
    perform pg_advisory_xact_lock(hashtextextended('booking-slot:' || v_barber.id::text || ':' || v_local_date::text, 0));
    v_open := v_shop.opens_at;
    v_close := v_shop.closes_at;
    select * into v_barber_hours from public.barber_hours where barber_hours.barber_id = v_barber.id and day_of_week = v_dow;
    v_has_barber_hours := found;
    if v_has_barber_hours then
      if v_barber_hours.is_closed then continue; end if;
      v_open := greatest(v_open, v_barber_hours.opens_at);
      v_close := least(v_close, v_barber_hours.closes_at);
    end if;
    if v_local_start::time < v_open or v_end at time zone v_settings.timezone > v_local_date + v_close then continue; end if;
    if extract(second from v_local_start) <> 0 or mod(extract(epoch from (v_local_start::time - v_open))::integer, 1800) <> 0 then continue; end if;
    if exists (
      select 1 from public.appointments a where a.barber_id = v_barber.id
        and a.status in ('pending','confirmed')
        and (a.status = 'confirmed' or a.created_at > now() - interval '30 minutes')
        and a.starts_at < v_end and a.ends_at > p_starts_at
    ) then continue; end if;

    v_code := upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 10));
    insert into public.appointments (booking_code, customer_name, customer_phone, service_id, barber_id, starts_at, ends_at, notes)
    values (v_code, trim(p_customer_name), trim(p_customer_phone), v_service.id, v_barber.id, p_starts_at, v_end, nullif(trim(p_notes),''))
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
revoke all on function public.create_public_booking(uuid, uuid, timestamptz, text, text, text, text) from public;
grant execute on function public.create_public_booking(uuid, uuid, timestamptz, text, text, text, text) to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('shop-media', 'shop-media', true, 8388608, array['image/jpeg','image/png','image/webp','image/avif'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
create policy "Public reads shop media" on storage.objects for select using (bucket_id = 'shop-media');
create policy "Admins upload shop media" on storage.objects for insert to authenticated with check (bucket_id = 'shop-media' and public.is_admin());
create policy "Admins update shop media" on storage.objects for update to authenticated using (bucket_id = 'shop-media' and public.is_admin()) with check (bucket_id = 'shop-media' and public.is_admin());
create policy "Admins delete shop media" on storage.objects for delete to authenticated using (bucket_id = 'shop-media' and public.is_admin());

create or replace function public.set_barber_services(p_barber_id uuid, p_service_ids uuid[])
returns void language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.is_admin() then raise exception 'admin_required' using errcode = '42501'; end if;
  if not exists (select 1 from public.barbers where id = p_barber_id) then raise exception 'barber_not_found'; end if;
  if cardinality(coalesce(p_service_ids, '{}')) > 100 then raise exception 'too_many_services'; end if;
  foreach v_id in array coalesce(p_service_ids, '{}') loop
    if not exists (select 1 from public.services where id = v_id) then raise exception 'service_not_found'; end if;
  end loop;
  delete from public.barber_services where barber_id = p_barber_id;
  insert into public.barber_services (barber_id, service_id)
    select p_barber_id, distinct_ids.id from (select distinct unnest(coalesce(p_service_ids, '{}')) as id) distinct_ids;
end;
$$;
revoke all on function public.set_barber_services(uuid, uuid[]) from public;
grant execute on function public.set_barber_services(uuid, uuid[]) to authenticated;

-- Last-line guard: serialize every active appointment mutation for a barber and reject overlap,
-- including admin confirmations and requests that race across different slot-query requests.
create or replace function public.enforce_appointment_no_overlap()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.status not in ('pending', 'confirmed') then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended('appointment-guard:' || new.barber_id::text, 0));
  update public.appointments a set status = 'cancelled'
    where a.id is distinct from new.id and a.barber_id = new.barber_id and a.status = 'pending'
      and a.created_at <= now() - interval '30 minutes'
      and a.starts_at < new.ends_at and a.ends_at > new.starts_at;
  if exists (
    select 1 from public.appointments a where a.id is distinct from new.id
      and a.barber_id = new.barber_id and a.status in ('pending','confirmed')
      and a.starts_at < new.ends_at and a.ends_at > new.starts_at
  ) then raise exception 'booking_slot_taken' using errcode = 'P0001'; end if;
  return new;
end;
$$;
create trigger appointments_prevent_overlap before insert or update of status, barber_id, starts_at, ends_at
on public.appointments for each row execute function public.enforce_appointment_no_overlap();

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
  update public.shop_settings set shop_name = trim(p_shop_name), address = nullif(trim(p_address), ''), city = nullif(trim(p_city), ''),
    timezone = p_timezone, phone_whatsapp = nullif(trim(p_phone_whatsapp), ''), instagram_url = nullif(trim(p_instagram_url), ''),
    booking_notice_minutes = p_booking_notice_minutes, booking_horizon_days = p_booking_horizon_days where id = 1;
  delete from public.shop_hours;
  insert into public.shop_hours (day_of_week, opens_at, closes_at, is_closed)
  select x.day_of_week, x.opens_at, x.closes_at, x.is_closed
  from jsonb_to_recordset(p_hours) as x(day_of_week smallint, opens_at time, closes_at time, is_closed boolean);
end;
$$;
revoke all on function public.admin_update_shop_setup(text, text, text, text, text, text, integer, integer, jsonb) from public;
grant execute on function public.admin_update_shop_setup(text, text, text, text, text, text, integer, integer, jsonb) to authenticated;
