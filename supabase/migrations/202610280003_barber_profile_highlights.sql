alter table public.barbers
  add column if not exists years_experience integer,
  add column if not exists preview_cut_url text;

do $migration$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.barbers'::regclass
      and conname = 'barbers_years_experience_range_check'
  ) then
    alter table public.barbers
      add constraint barbers_years_experience_range_check
      check (years_experience is null or years_experience between 0 and 60);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.barbers'::regclass
      and conname = 'barbers_preview_cut_url_https_check'
  ) then
    alter table public.barbers
      add constraint barbers_preview_cut_url_https_check
      check (preview_cut_url is null or preview_cut_url ~ '^https://');
  end if;
end;
$migration$;
