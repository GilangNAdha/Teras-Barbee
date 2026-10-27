import type { Metadata } from 'next';
import { ArrowLeft, CalendarDays } from 'lucide-react';
import Link from 'next/link';
import { BookingForm } from '@/components/booking-form';
import { getActiveBarbers, getActiveServices, getBarberServiceIds, getShopSettings } from '@/lib/public-data';

export const metadata: Metadata = { title: 'Book a chair' };

function dateInTimezone(timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const get = (key: string) => parts.find(part => part.type === key)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export default async function BookPage({ searchParams }: { searchParams: Promise<{ service?: string; barber?: string }> }) {
  const [{ service = '', barber = '' }, services, barbers, barberServices, settings] = await Promise.all([
    searchParams, getActiveServices(), getActiveBarbers(), getBarberServiceIds(), getShopSettings()
  ]);
  const timezone = settings?.timezone || 'Asia/Jakarta';
  return <main id="main" className="section-pad mx-auto min-h-[70vh] max-w-[1400px] py-12 sm:py-20">
    <Link href="/" className="label mb-10 inline-flex items-center gap-2 text-neutral-500"><ArrowLeft size={13} /> Back to Terasbarber</Link>
    <div className="grid gap-10 lg:grid-cols-[.8fr_1.2fr] lg:gap-20">
      <div><p className="label mb-5 flex items-center gap-2 text-neutral-500"><CalendarDays size={14} /> Appointment request</p><h1 className="display text-[clamp(58px,9vw,112px)]">GET IN.<br />GET FRESH.</h1><p className="mt-6 max-w-sm text-sm leading-6 text-neutral-600">Choose a service, barber, and open time. The shop will confirm your request directly.</p><div className="mt-10 border-t border-black/20 pt-5"><span className="label text-neutral-500">Before you book</span><ul className="mt-4 space-y-3 text-xs leading-5 text-neutral-600"><li>• Pick an available start time; the service duration is reserved automatically.</li><li>• Add a reachable WhatsApp number so the shop can confirm.</li><li>• If a slot is taken while you submit, choose the next available time.</li></ul></div></div>
      <BookingForm services={services.map(item => ({ id: item.id, name: item.name, description: item.description, category: item.category, image_url: item.image_url, price_idr: item.price_idr, duration_minutes: item.duration_minutes }))} barbers={barbers.map(item => ({ id: item.id, name: item.name, serviceIds: barberServices[item.id] ?? [] }))} timezone={timezone} today={dateInTimezone(timezone)} horizonDays={settings?.booking_horizon_days ?? 45} configured={Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.BOOKING_HASH_SECRET)} initialServiceId={services.some(item => item.id === service) ? service : ''} initialBarberId={barbers.some(item => item.id === barber && (!services.some(serviceItem => serviceItem.id === service) || (barberServices[item.id] ?? []).includes(service))) ? barber : ''} />
    </div>
  </main>;
}
