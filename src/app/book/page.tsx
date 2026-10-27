import type { Metadata } from 'next';
import { BookingPageContent } from '@/components/booking-page-content';
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
  const initialServiceId = services.some(item => item.id === service) ? service : '';
  const initialBarberId = barbers.some(item => item.id === barber && (!initialServiceId || (barberServices[item.id] ?? []).includes(initialServiceId))) ? barber : '';

  return <BookingPageContent
    services={services.map(item => ({ id: item.id, name: item.name, description: item.description, category: item.category, image_url: item.image_url, price_idr: item.price_idr, duration_minutes: item.duration_minutes }))}
    barbers={barbers.map(item => ({ id: item.id, name: item.name, bio: item.bio, specialties: item.specialties, serviceIds: barberServices[item.id] ?? [] }))}
    timezone={timezone}
    today={dateInTimezone(timezone)}
    horizonDays={settings?.booking_horizon_days ?? 45}
    configured={Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.BOOKING_HASH_SECRET)}
    initialServiceId={initialServiceId}
    initialBarberId={initialBarberId}
  />;
}
