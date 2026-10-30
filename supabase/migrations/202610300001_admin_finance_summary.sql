create index if not exists appointments_finance_month_idx
  on public.appointments (starts_at, status) include (price_idr_snapshot);

create or replace function public.admin_finance_summary(p_from timestamptz, p_to timestamptz)
returns table (
  booking_count bigint,
  completed_revenue bigint,
  scheduled_value bigint,
  pending_count bigint,
  confirmed_count bigint,
  completed_count bigint,
  cancelled_count bigint,
  no_show_count bigint,
  average_completed_ticket numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    count(*)::bigint,
    coalesce(sum(a.price_idr_snapshot) filter (where a.status = 'completed'), 0)::bigint,
    coalesce(sum(a.price_idr_snapshot) filter (where a.status in ('pending', 'confirmed')), 0)::bigint,
    count(*) filter (where a.status = 'pending')::bigint,
    count(*) filter (where a.status = 'confirmed')::bigint,
    count(*) filter (where a.status = 'completed')::bigint,
    count(*) filter (where a.status = 'cancelled')::bigint,
    count(*) filter (where a.status = 'no_show')::bigint,
    coalesce(avg(a.price_idr_snapshot) filter (where a.status = 'completed'), 0)
  from public.appointments a
  where public.is_admin()
    and a.starts_at >= p_from
    and a.starts_at < p_to;
$$;
revoke all on function public.admin_finance_summary(timestamptz, timestamptz) from public, anon;
grant execute on function public.admin_finance_summary(timestamptz, timestamptz) to authenticated;
