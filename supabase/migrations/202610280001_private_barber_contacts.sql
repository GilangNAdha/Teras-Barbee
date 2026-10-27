-- Keep individual barber WhatsApp numbers out of public barber/profile queries.
create table public.barber_contact_channels (
  barber_id uuid primary key references public.barbers(id) on delete cascade,
  phone_whatsapp text not null check (phone_whatsapp ~ '^[+]?[0-9][0-9 ()-]{7,19}$'),
  updated_at timestamptz not null default now()
);

alter table public.barber_contact_channels enable row level security;
revoke all on public.barber_contact_channels from public, anon;
grant select, insert, update, delete on public.barber_contact_channels to authenticated;
grant all on public.barber_contact_channels to service_role;

create policy "Admins manage private barber contact channels"
on public.barber_contact_channels for all to authenticated
using (public.is_admin()) with check (public.is_admin());

create trigger barber_contact_channels_touch_updated
before update on public.barber_contact_channels
for each row execute function public.touch_updated_at();
