import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, ArrowUpRight, Banknote, CalendarRange, CircleDollarSign, Clock3, ReceiptText } from 'lucide-react';
import { AdminShell } from '@/components/admin-shell';
import { requireAdmin } from '@/lib/auth';
import { formatDateTime, idr } from '@/lib/format';

export const metadata: Metadata = { title: 'Finance overview' };
export const dynamic = 'force-dynamic';

function monthKeyInTimezone(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit' }).formatToParts(date);
  const get = (type: string) => parts.find(part => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}`;
}

function utcAtLocalMidnight(dateKey: string, timezone: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const target = Date.UTC(year, month - 1, day);
  let estimate = target;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(estimate));
    const value = (type: string) => Number(parts.find(part => part.type === type)?.value ?? 0);
    const represented = Date.UTC(value('year'), value('month') - 1, value('day'), value('hour'), value('minute'), value('second'));
    estimate += target - represented;
  }
  return new Date(estimate).toISOString();
}

function monthOptions(current: string) {
  return Array.from({ length: 12 }, (_, offset) => {
    const [year, month] = current.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1 - offset, 1));
    const value = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    return { value, label: new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date) };
  });
}

export default async function FinancePage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const [{ month: requestedMonth }, auth] = await Promise.all([searchParams, requireAdmin()]);
  const { data: settings } = await auth.supabase.from('shop_settings').select('timezone').eq('id', 1).maybeSingle();
  const timezone = settings?.timezone || 'Asia/Jakarta';
  const currentMonth = monthKeyInTimezone(new Date(), timezone);
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(requestedMonth || '') && (requestedMonth || '') <= currentMonth ? requestedMonth! : currentMonth;
  const [year, monthNumber] = month.split('-').map(Number);
  const startDate = `${month}-01`;
  const endDate = `${new Date(Date.UTC(year, monthNumber, 1)).toISOString().slice(0, 10)}`;
  const from = utcAtLocalMidnight(startDate, timezone);
  const to = utcAtLocalMidnight(endDate, timezone);
  const [{ data: summaryRows, error }, { data: completedBookings }] = await Promise.all([
    auth.supabase.rpc('admin_finance_summary', { p_from: from, p_to: to }),
    auth.supabase.from('appointments').select('booking_code,customer_name,service_name_snapshot,price_idr_snapshot,starts_at').eq('status', 'completed').gte('starts_at', from).lt('starts_at', to).order('starts_at', { ascending: false }).limit(8)
  ]);
  const summary = summaryRows?.[0];
  const monthLabel = new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`));
  const completedRevenue = Number(summary?.completed_revenue || 0);
  const scheduledValue = Number(summary?.scheduled_value || 0);
  const maxCount = Math.max(1, Number(summary?.booking_count || 0));

  return <AdminShell active="/admin/finance" userLabel={auth.profile.full_name || auth.user.email || 'Administrator'}>
    <p className="label mb-3 text-neutral-500">Business health / Finance</p>
    <div className="flex flex-wrap items-end justify-between gap-5"><div><h1 className="display text-5xl sm:text-7xl">MONEY<br className="sm:hidden" /> OVERVIEW<span className="text-lime">.</span></h1><p className="mt-4 max-w-xl text-sm leading-6 text-neutral-600">A booking-based view of service value. This is not a payment ledger; record actual payments with your payment provider or accounting system.</p></div>
      <form className="flex w-full flex-wrap items-end gap-2 sm:w-auto" action="/admin/finance"><label className="block w-full sm:w-auto"><span className="label mb-2 block">Reporting month</span><select className="form-field w-full min-w-0 sm:w-auto sm:min-w-48" name="month" defaultValue={month}>{monthOptions(currentMonth).map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><button className="btn-dark w-full sm:w-auto" type="submit"><CalendarRange size={14} /> View</button></form>
    </div>
    <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-y border-black/15 py-4"><p className="label text-neutral-500">{monthLabel} / shop time: {timezone}</p><Link href="/admin/bookings" className="label inline-flex min-h-11 items-center gap-2 text-neutral-600 hover:text-black">All booking records <ArrowUpRight size={13} /></Link></div>
    {error && <p role="alert" className="mt-5 border border-red-800/20 bg-red-50 p-3 text-xs">Finance summary is unavailable. Apply the latest Supabase migrations and try again.</p>}
    <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <FinanceCard title="Completed service value" amount={idr(completedRevenue)} hint={`${summary?.completed_count ?? 0} completed appointments`} icon={<CircleDollarSign size={17} />} featured />
      <FinanceCard title="Scheduled value" amount={idr(scheduledValue)} hint={`${(summary?.pending_count ?? 0) + (summary?.confirmed_count ?? 0)} pending / confirmed`} icon={<Clock3 size={17} />} />
      <FinanceCard title="Average completed ticket" amount={idr(Number(summary?.average_completed_ticket || 0))} hint="Based on completed bookings" icon={<ReceiptText size={17} />} />
      <FinanceCard title="Appointments this month" amount={String(summary?.booking_count ?? 0)} hint={`${summary?.cancelled_count ?? 0} cancelled · ${summary?.no_show_count ?? 0} no-show`} icon={<Banknote size={17} />} />
    </div>
    <div className="mt-8 grid gap-6 xl:grid-cols-[.8fr_1.2fr]">
      <section className="border border-black/15 p-5 sm:p-6"><p className="label text-neutral-500">Booking mix</p><h2 className="display mt-3 text-3xl">MONTH STATUS</h2><div className="mt-6 space-y-5">{[
        ['Completed', Number(summary?.completed_count || 0)], ['Confirmed', Number(summary?.confirmed_count || 0)], ['Pending', Number(summary?.pending_count || 0)], ['Cancelled', Number(summary?.cancelled_count || 0)], ['No-show', Number(summary?.no_show_count || 0)]
      ].map(([label, count]) => <div key={label}><div className="mb-2 flex justify-between text-xs"><span>{label}</span><span className="font-bold">{count}</span></div><div className="h-2 bg-black/10"><div className="h-full bg-ink" style={{ width: `${Math.max(Number(count) > 0 ? 4 : 0, Number(count) / maxCount * 100)}%` }} /></div></div>)}</div><p className="mt-6 border-t border-black/10 pt-4 text-[10px] leading-5 text-neutral-500">Completed value uses the service price saved when each booking was made. Scheduled value includes active pending and confirmed appointments; cancellations, no-shows, discounts, tips, and payment fees are not included.</p></section>
      <section className="min-w-0"><div className="flex items-end justify-between gap-3"><div><p className="label mb-2 text-neutral-500">Completed appointments</p><h2 className="display text-3xl">LATEST SERVICE VALUE</h2></div><span className="label text-neutral-500">{completedBookings?.length || 0} shown</span></div><div className="touch-scroll mt-5 border-y border-black/15" role="region" aria-label="Completed appointments table, scroll horizontally for more columns" tabIndex={0}>{completedBookings?.length ? <table className="data-table w-full min-w-[580px] border-collapse text-left text-xs"><thead><tr className="label border-b border-black/15 text-[9px] text-neutral-500"><th className="px-3 py-3">Booking</th><th className="px-3 py-3">Service</th><th className="px-3 py-3">Completed</th><th className="px-3 py-3 text-right">Value</th></tr></thead><tbody>{completedBookings.map(booking => <tr key={booking.booking_code} className="border-b border-black/10 last:border-0"><td className="px-3 py-4"><span className="font-bold">{booking.booking_code}</span><span className="mt-1 block text-neutral-500">{booking.customer_name}</span></td><td className="px-3 py-4">{booking.service_name_snapshot}</td><td className="px-3 py-4">{formatDateTime(booking.starts_at, timezone)}</td><td className="px-3 py-4 text-right font-bold">{idr(booking.price_idr_snapshot)}</td></tr>)}</tbody></table> : <p className="py-8 text-sm text-neutral-600">No completed appointments for this month yet.</p>}</div><div className="mt-4 flex justify-end"><Link className="label inline-flex min-h-11 items-center gap-2 border-b border-black/25 pb-2" href={`/admin/bookings?status=completed`}>Browse completed history <ArrowUpRight size={13} /></Link></div></section>
    </div>
    <div className="mt-8"><Link href="/admin" className="label inline-flex min-h-11 items-center gap-2 text-neutral-600 hover:text-black"><ArrowLeft size={13} /> Back to dashboard</Link></div>
  </AdminShell>;
}

function FinanceCard({ title, amount, hint, icon, featured = false }: { title: string; amount: string; hint: string; icon: React.ReactNode; featured?: boolean }) {
  return <article className={`border p-4 sm:p-5 ${featured ? 'border-ink bg-ink text-cream' : 'border-black/15'}`}><div className={`flex items-center justify-between ${featured ? 'text-lime' : 'text-neutral-500'}`}><span className="label">{title}</span>{icon}</div><p className="display mt-7 break-words text-3xl sm:text-4xl">{amount}</p><p className={`mt-3 text-xs ${featured ? 'text-white/60' : 'text-neutral-500'}`}>{hint}</p></article>;
}
