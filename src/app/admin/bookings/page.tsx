import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, CalendarClock } from 'lucide-react';
import { AdminShell } from '@/components/admin-shell';
import { revokeBookingManageTokenAction, updateAppointmentAction } from '@/app/admin/actions';
import { requireAdmin } from '@/lib/auth';
import { formatDateTime } from '@/lib/format';

export const metadata: Metadata = { title: 'Booking history' };
export const dynamic = 'force-dynamic';

const pageSize = 40;
const statuses = ['all', 'pending', 'confirmed', 'cancelled', 'completed', 'no_show'] as const;
type StatusFilter = typeof statuses[number];
const validStatus = (value: string | undefined): value is StatusFilter => statuses.includes(value as StatusFilter);

export default async function BookingHistoryPage({ searchParams }: { searchParams: Promise<{ page?: string; status?: string; error?: string; saved?: string; link_revoked?: string }> }) {
  const [{ page: pageParam, status: statusParam, error, saved, link_revoked }, auth] = await Promise.all([searchParams, requireAdmin()]);
  const status: StatusFilter = validStatus(statusParam) ? statusParam : 'all';
  const requestedPage = Math.max(1, Number.parseInt(pageParam || '1', 10) || 1);
  const supabase = auth.supabase;
  let query = supabase.from('appointments').select('*', { count: 'exact' }).order('created_at', { ascending: false });
  if (status !== 'all') query = query.eq('status', status);
  const { count: total = 0 } = await (status === 'all' ? supabase.from('appointments').select('id', { count: 'exact', head: true }) : supabase.from('appointments').select('id', { count: 'exact', head: true }).eq('status', status));
  const totalPages = Math.max(1, Math.ceil((total ?? 0) / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const { data: appointments, error: queryError } = await query.range((page - 1) * pageSize, page * pageSize - 1);
  const [{ data: services }, { data: barbers }, { data: settings }] = await Promise.all([
    supabase.from('services').select('id,name'),
    supabase.from('barbers').select('id,name'),
    supabase.from('shop_settings').select('timezone').eq('id', 1).maybeSingle()
  ]);
  const serviceNames = new Map((services ?? []).map(item => [item.id, item.name]));
  const barberNames = new Map((barbers ?? []).map(item => [item.id, item.name]));
  const timezone = settings?.timezone || 'Asia/Jakarta';
  const rows = appointments ?? [];
  const hrefFor = (nextPage: number, nextStatus = status) => `/admin/bookings?page=${nextPage}&status=${nextStatus}`;

  return <AdminShell active="/admin/bookings" userLabel={auth.profile.full_name || auth.user.email || 'Administrator'}>
    <p className="label mb-3 text-neutral-500">Appointments / Archive</p><h1 className="display text-5xl sm:text-7xl">BOOKING<br />HISTORY<span className="text-lime">.</span></h1>
    {saved && <p role="status" className="mt-5 border border-green-800/20 bg-green-50 p-3 text-xs">Appointment status updated.</p>}
    {link_revoked && <p role="status" className="mt-5 border border-green-800/20 bg-green-50 p-3 text-xs">The customer management link has been revoked if one was issued.</p>}
    {error && <p role="alert" className="mt-5 border border-red-800/20 bg-red-50 p-3 text-xs">The appointment could not be updated.</p>}
    {queryError && <p role="alert" className="mt-5 border border-red-800/20 bg-red-50 p-3 text-xs">Booking history could not be loaded.</p>}
    <div className="mt-8 flex flex-wrap items-end justify-between gap-4 border-b border-black/20 pb-5">
      <div><p className="label text-neutral-500">{total} recorded {total === 1 ? 'booking' : 'bookings'}</p><p className="mt-2 text-xs text-neutral-600">Every appointment request stays linked to the barber assigned to its time slot.</p></div>
      <Link href="/admin" className="label inline-flex items-center gap-2 text-neutral-600 hover:text-black"><ArrowLeft size={13} /> Dashboard</Link>
    </div>
    <nav className="mt-5 flex flex-wrap gap-2" aria-label="Filter booking history by status">{statuses.map(item => <Link key={item} href={hrefFor(1, item)} aria-current={status === item ? 'page' : undefined} className={`filter-chip ${status === item ? 'is-active' : ''}`}>{item === 'all' ? 'All bookings' : item.replace('_', ' ')}</Link>)}</nav>
    <div className="mt-6 overflow-x-auto border-y border-black/20">
      {rows.length ? <table className="data-table w-full min-w-[780px] border-collapse text-left text-xs"><thead><tr className="label border-b border-black/20 text-[9px] text-neutral-500">{['Booking / Guest','Service / Assigned barber','Appointment time','Status','Update'].map(label => <th key={label} className="px-3 py-3 font-bold">{label}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.id} className="border-b border-black/10 last:border-0"><td className="px-3 py-4"><span className="font-bold">{row.booking_code}</span><span className="mt-1 block text-neutral-600">{row.customer_name}</span><a className="mt-1 block text-neutral-500 underline" href={`tel:${row.customer_phone}`}>{row.customer_phone}</a><span className="mt-1 block text-[10px] text-neutral-500">Received {formatDateTime(row.created_at, timezone)}</span></td><td className="px-3 py-4">{serviceNames.get(row.service_id) || 'Removed service'}<span className="mt-1 block text-neutral-500">Barber: {barberNames.get(row.barber_id) || 'Removed barber'}</span></td><td className="px-3 py-4">{formatDateTime(row.starts_at, timezone)}<span className="mt-1 block text-neutral-500">Ends {formatDateTime(row.ends_at, timezone)}</span></td><td className="px-3 py-4"><span className="badge">{row.status}</span></td><td className="px-3 py-4"><div className="grid gap-2">{['pending', 'confirmed'].includes(row.status) ? <form action={updateAppointmentAction} className="flex items-center gap-2"><input type="hidden" name="id" value={row.id} /><input type="hidden" name="return_to" value={`/admin/bookings?page=${page}&status=${status}`} /><select className="border border-black/20 bg-cream p-2 text-xs" name="status" defaultValue={row.status === 'pending' ? 'confirmed' : 'completed'} aria-label={`Update booking ${row.booking_code}`}><option value="confirmed">Confirm</option><option value="cancelled">Cancel</option><option value="completed">Complete</option><option value="no_show">No show</option></select><button className="border border-black px-3 py-2 text-[9px] font-bold uppercase hover:bg-lime">Save</button></form> : <span className="text-neutral-400">—</span>}<form action={revokeBookingManageTokenAction}><input type="hidden" name="id" value={row.id} /><button className="text-left text-[9px] font-bold uppercase text-neutral-500 underline underline-offset-2 hover:text-red-700">Revoke customer link</button></form></div></td></tr>)}</tbody></table> : <p className="py-10 text-center text-sm text-neutral-600"><CalendarClock className="mx-auto mb-3" size={20} />No bookings match this filter.</p>}
    </div>
    <div className="mt-5 flex items-center justify-between gap-4"><p className="label text-neutral-500">Page {page} of {totalPages}</p><div className="flex gap-2"><Link aria-disabled={page <= 1} className={`filter-chip ${page <= 1 ? 'pointer-events-none opacity-40' : ''}`} href={hrefFor(Math.max(1, page - 1))}><ArrowLeft size={13} className="inline" /> Previous</Link><Link aria-disabled={page >= totalPages} className={`filter-chip ${page >= totalPages ? 'pointer-events-none opacity-40' : ''}`} href={hrefFor(Math.min(totalPages, page + 1))}>Next <ArrowRight size={13} className="inline" /></Link></div></div>
  </AdminShell>;
}
