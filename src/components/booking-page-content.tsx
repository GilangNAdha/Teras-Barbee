'use client';

import Link from 'next/link';
import { ArrowLeft, CalendarDays } from 'lucide-react';
import { BookingForm } from '@/components/booking-form';

type ServiceOption = { id: string; name: string; description: string; category: 'HAIRCUT' | 'COMBO' | 'BEARD'; image_url: string | null; price_idr: number; duration_minutes: number };
type BarberOption = { id: string; name: string; bio: string; specialties: string[]; serviceIds: string[] };

export function BookingPageContent({ services, barbers, timezone, today, horizonDays, configured, initialServiceId, initialBarberId }: {
  services: ServiceOption[]; barbers: BarberOption[]; timezone: string; today: string; horizonDays: number; configured: boolean; initialServiceId: string; initialBarberId: string;
}) {
  return <main id="main" lang="en" className="booking-page-shell page-shell min-h-[70vh] py-8 sm:py-14">
    <div className="mb-9 flex flex-wrap items-center justify-between gap-4 border-b border-black/15 pb-4">
      <Link href="/" className="label inline-flex min-h-11 items-center gap-2 text-neutral-500"><ArrowLeft size={13} /> Back to Terasbarber</Link>
    </div>
    <div className="mx-auto grid w-full max-w-[1400px] gap-8 lg:grid-cols-[.8fr_1.2fr] lg:gap-16">
      <div className="lg:pt-3">
        <p className="label mb-5 flex items-center gap-2 text-neutral-500"><CalendarDays size={14} /> Appointment request</p>
        <h1 className="display text-[clamp(58px,9vw,112px)]">BOOK.<br />YOUR CHAIR.</h1>
        <p className="mt-6 max-w-sm text-sm leading-6 text-neutral-600">Choose a service and barber, then pick an available time. Your request is saved as pending until the shop confirms it.</p>
        <div className="booking-guidance-card mt-8 border border-black/10 bg-white/30 p-5 backdrop-blur-sm sm:mt-10"><span className="label text-neutral-500">Before you book</span><ul className="mt-4 space-y-3 text-xs leading-5 text-neutral-600"><li>• Live slots account for the schedule and service duration.</li><li>• Enter an active WhatsApp number so the shop can reach you.</li><li>• Your appointment stays pending until the shop confirms it.</li></ul></div>
      </div>
      <BookingForm services={services} barbers={barbers} timezone={timezone} today={today} horizonDays={horizonDays} configured={configured} initialServiceId={initialServiceId} initialBarberId={initialBarberId} />
    </div>
  </main>;
}
