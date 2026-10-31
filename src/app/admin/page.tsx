import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, CalendarClock, Clock3, Scissors } from 'lucide-react';
import { AdminShell } from '@/components/admin-shell';
import { updateAppointmentAction } from './actions';
import { requireAdmin } from '@/lib/auth';
import { formatDateTime } from '@/lib/format';

export const metadata: Metadata = { title: 'Admin dashboard' };
export const dynamic = 'force-dynamic';

function nextDate(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
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

export default async function AdminDashboard({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const [{ saved, error }, auth] = await Promise.all([searchParams, requireAdmin()]);
  const supabase = auth.supabase;
  const [{ data: appointments, count: totalBookingCount }, { count: serviceCount }, { count: barberCount }, { count: pendingCount }, { data: shopSettings }] = await Promise.all([
    supabase.from('appointments').select('*', { count: 'exact' }).order('created_at', { ascending: false }).limit(20),
    supabase.from('services').select('id', { count: 'exact', head: true }),
    supabase.from('barbers').select('id', { count: 'exact', head: true }),
    supabase.from('appointments').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('shop_settings').select('timezone').eq('id', 1).maybeSingle()
  ]);
  const { data: barbers } = await supabase.from('barbers').select('id,name');
  const barberNames = new Map((barbers ?? []).map(item => [item.id, item.name]));
  const rows = appointments ?? [];
  const timezone = shopSettings?.timezone || 'Asia/Jakarta';
  const pending = pendingCount ?? 0;
  const dateInShopTime = (value: string) => new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
  const today = dateInShopTime(new Date().toISOString());
  const startOfToday = utcAtLocalMidnight(today, timezone);
  const tomorrowKey = nextDate(today);
  const startOfTomorrow = utcAtLocalMidnight(tomorrowKey, timezone);
  const { count: todayCount } = await supabase.from('appointments').select('id', { count: 'exact', head: true }).in('status', ['pending', 'confirmed']).gte('starts_at', startOfToday).lt('starts_at', startOfTomorrow);

  return <AdminShell active="/admin" userLabel={auth.profile.full_name || auth.user.email || 'Administrator'}>
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="label mb-3 text-neutral-500">Shop operations</p><h1 className="display text-5xl sm:text-7xl">THE<br className="sm:hidden" /> DASHBOARD.</h1></div><p className="label text-neutral-500">Appointments are private to admin accounts.</p></div>
    {saved && <p role="status" className="mt-6 border border-green-800/20 bg-green-50 p-3 text-xs">Appointment updated.</p>}
    {error && <p role="alert" className="mt-6 border border-red-800/20 bg-red-50 p-3 text-xs">The appointment could not be updated.</p>}
    <div className="mt-8 grid gap-3 sm:grid-cols-3">
      <Stat label="Today" value={todayCount ?? 0} icon={<CalendarClock size={17} />} />
      <Stat label="Pending" value={pending} icon={<Clock3 size={17} />} />
      <Stat label="Services / barbers" value={`${serviceCount ?? 0} / ${barberCount ?? 0}`} icon={<Scissors size={17} />} />
    </div>
    <div className="mt-12 flex flex-wrap items-end justify-between gap-3"><div><p className="label mb-2 text-neutral-500">Recent bookings / {totalBookingCount ?? 0} in history</p><h2 className="display text-3xl sm:text-4xl">APPOINTMENTS</h2></div><Link className="label inline-flex items-center gap-2 border-b border-black/30 pb-2 hover:text-neutral-500" href="/admin/bookings">Open booking history <ArrowRight size={14} /></Link></div>
    <div className="mt-5 overflow-x-auto border-y border-black/20">
      {rows.length ? <table className="data-table w-full min-w-[760px] border-collapse text-left text-xs"><thead><tr className="label border-b border-black/20 text-[9px] text-neutral-500">{['Code / Guest','Service / Barber','Requested time','Status','Update'].map(label => <th key={label} className="px-3 py-3 font-bold">{label}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.id} className="border-b border-black/10 last:border-0"><td className="px-3 py-4"><span className="font-bold">{row.booking_code}</span><span className="mt-1 block text-neutral-600">{row.customer_name}</span><a className="mt-1 block text-neutral-500 underline" href={`tel:${row.customer_phone}`}>{row.customer_phone}</a><span className="mt-1 block text-[10px] text-neutral-500">Received {formatDateTime(row.created_at, timezone)}</span></td><td className="px-3 py-4">{row.service_name_snapshot || 'Removed service'}<span className="mt-1 block text-neutral-500">{barberNames.get(row.barber_id) || 'Removed barber'}</span></td><td className="px-3 py-4">{formatDateTime(row.starts_at, timezone)}<span className="mt-1 block text-neutral-500">Ends {formatDateTime(row.ends_at, timezone)}</span></td><td className="px-3 py-4"><span className="badge">{row.status}</span></td><td className="px-3 py-4">{['pending', 'confirmed'].includes(row.status) ? <form action={updateAppointmentAction} className="flex items-center gap-2"><input type="hidden" name="id" value={row.id} /><select className="border border-black/20 bg-cream p-2 text-xs" name="status" defaultValue={row.status === 'pending' ? 'confirmed' : 'completed'}><option value="confirmed">Confirm</option><option value="cancelled">Cancel</option><option value="completed">Complete</option><option value="no_show">No show</option></select><button className="border border-black px-3 py-2 text-[9px] font-bold uppercase hover:bg-lime">Save</button></form> : <span className="text-neutral-400">—</span>}</td></tr>)}</tbody></table> : <p className="py-8 text-sm text-neutral-600">No appointment requests yet.</p>}
    </div>
  </AdminShell>;
}

function Stat({ label, value, icon }: { label: string; value: string | number; icon: React.ReactNode }) {
  return <div className="border border-black/15 p-4"><div className="flex items-center justify-between text-neutral-500"><span className="label">{label}</span>{icon}</div><p className="display mt-6 text-4xl">{value}</p></div>;
}
