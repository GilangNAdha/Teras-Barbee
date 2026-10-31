import type { Metadata } from 'next';
import { AdminShell } from '@/components/admin-shell';
import { requireAdmin } from '@/lib/auth';
import { saveShopSettingsAction } from './actions';

export const metadata: Metadata = { title: 'Shop setup' };
export const dynamic = 'force-dynamic';
const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const errors: Record<string, string> = { invalid: 'Check the settings values.', timezone: 'Enter a valid IANA time zone, for example Asia/Jakarta.', hours: 'Each open day needs a valid opening and closing time; closing must be later than opening.', save: 'Settings could not be saved.' };

export default async function AdminSettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const [{ error, saved }, auth] = await Promise.all([searchParams, requireAdmin()]);
  const supabase = auth.supabase;
  const [{ data: settings }, { data: hours }] = await Promise.all([
    supabase.from('shop_settings').select('*').eq('id', 1).maybeSingle(),
    supabase.from('shop_hours').select('*').order('day_of_week')
  ]);
  const hoursMap = new Map((hours ?? []).map(day => [day.day_of_week, day]));
  return <AdminShell active="/admin/settings" userLabel={auth.profile.full_name || auth.user.email || 'Administrator'}>
    <p className="label mb-3 text-neutral-500">Business details</p><h1 className="display text-5xl sm:text-7xl">SHOP SETUP.</h1>
    <p className="mt-4 max-w-xl text-sm leading-6 text-neutral-600">These verified shop details power the public site and control when booking slots appear. Individual barber hours default to these opening hours unless overridden in the database.</p>
    {saved && <p role="status" className="mt-5 border border-green-800/20 bg-green-50 p-3 text-xs">Shop details and schedule saved.</p>}
    {error && <p role="alert" className="mt-5 border border-red-800/20 bg-red-50 p-3 text-xs">{errors[error] || 'There was a problem.'}</p>}
    <form action={saveShopSettingsAction} className="mt-8 grid gap-8 xl:grid-cols-[1fr_1fr]">
      <section className="space-y-4 border border-black/20 p-5"><h2 className="label">Public contact</h2>
        <Field label="Shop name" name="shop_name" defaultValue={settings?.shop_name || 'Terasbarber'} required />
        <Field label="Street address" name="address" defaultValue={settings?.address || ''} />
        <Field label="City / region" name="city" defaultValue={settings?.city || ''} />
        <Field label="WhatsApp number, with country code" name="phone_whatsapp" defaultValue={settings?.phone_whatsapp || ''} placeholder="+62…" />
        <Field label="Instagram profile URL" name="instagram_url" defaultValue={settings?.instagram_url || ''} placeholder="https://instagram.com/…" />
        <Field label="IANA time zone" name="timezone" defaultValue={settings?.timezone || 'Asia/Jakarta'} required />
      </section>
      <section className="border border-black/20 p-5"><h2 className="label">Opening hours</h2><p className="mt-2 text-xs text-neutral-500">Local time in the configured shop time zone. A slot is available only when the whole service fits before closing.</p>
        <div className="mt-5 space-y-2">{days.map((day, index) => { const row = hoursMap.get(index); return <div key={day} className="grid grid-cols-2 items-center gap-2 border-t border-black/10 py-3 sm:grid-cols-[90px_1fr_1fr_70px] sm:py-2"><span className="col-span-2 text-xs font-semibold sm:col-span-1">{day}</span><label className="min-w-0"><span className="sr-only">{day} opens</span><input className="w-full min-w-0 border border-black/20 bg-transparent p-3 text-base sm:p-2 sm:text-xs" type="time" name={`open_${index}`} defaultValue={row?.opens_at?.slice(0, 5) || ''} disabled={row?.is_closed ?? true} /></label><label className="min-w-0"><span className="sr-only">{day} closes</span><input className="w-full min-w-0 border border-black/20 bg-transparent p-3 text-base sm:p-2 sm:text-xs" type="time" name={`close_${index}`} defaultValue={row?.closes_at?.slice(0, 5) || ''} disabled={row?.is_closed ?? true} /></label><label className="col-span-2 flex min-h-11 items-center gap-2 text-[10px] sm:col-span-1 sm:min-h-0"><input className="size-5 accent-black sm:size-4" type="checkbox" name={`closed_${index}`} defaultChecked={row?.is_closed ?? true} onChange={event => { const parent = event.currentTarget.parentElement?.parentElement; parent?.querySelectorAll('input[type=time]').forEach(input => { (input as HTMLInputElement).disabled = event.currentTarget.checked; }); }} />Closed</label></div>; })}</div>
      </section>
      <section className="space-y-4 border border-black/20 p-5"><h2 className="label">Booking rules</h2><div className="grid gap-4 sm:grid-cols-2"><Field label="Minimum notice (minutes)" name="booking_notice_minutes" type="number" defaultValue={settings?.booking_notice_minutes ?? 60} required /><Field label="Advance booking limit (days)" name="booking_horizon_days" type="number" defaultValue={settings?.booking_horizon_days ?? 45} required /><Field label="Customer cancellation deadline (minutes)" name="customer_cancellation_deadline_minutes" type="number" defaultValue={settings?.customer_cancellation_deadline_minutes ?? 120} required /><Field label="Customer reschedule deadline (minutes)" name="customer_reschedule_deadline_minutes" type="number" defaultValue={settings?.customer_reschedule_deadline_minutes ?? 120} required /></div><p className="text-xs leading-5 text-neutral-500">Deadlines are enforced in the database. Enter 0 to allow changes until the appointment start; changing the browser URL cannot bypass these rules.</p></section>
      <button className="btn-primary h-fit self-end" type="submit">Save shop setup</button>
    </form>
  </AdminShell>;
}

function Field({ label, name, defaultValue, type = 'text', required = false, placeholder }: { label: string; name: string; defaultValue?: string | number; type?: string; required?: boolean; placeholder?: string }) {
  return <label className="block"><span className="label mb-1 block">{label}</span><input className="form-field" name={name} type={type} defaultValue={defaultValue} placeholder={placeholder} required={required} min={type === 'number' ? 0 : undefined} maxLength={240} /></label>;
}
