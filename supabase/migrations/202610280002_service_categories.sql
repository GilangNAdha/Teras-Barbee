-- Add menu categories to projects that already applied the initial schema.
alter table public.services
  add column if not exists category text not null default 'HAIRCUT';

do $migration$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.services'::regclass
      and conname = 'services_category_check'
  ) then
    alter table public.services
      add constraint services_category_check check (category in ('HAIRCUT', 'COMBO', 'BEARD'));
  end if;
end;
$migration$;
