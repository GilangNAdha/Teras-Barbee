import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft, CalendarDays, Clock3, MessageCircle } from 'lucide-react';
import { BookingForm } from '@/components/booking-form';
import type { BookingBarber, BookingService } from '@/lib/booking-options';

export function BookingPageContent({ services, barbers, timezone, today, horizonDays, configured, initialServiceId, initialBarberId, loadError = false }: {
  services: BookingService[]; barbers: BookingBarber[]; timezone: string; today: string; horizonDays: number; configured: boolean; initialServiceId: string; initialBarberId: string; loadError?: boolean;
}) {
  return <main id="main" lang="en" className="booking-page-shell">
    <div className="section-pad mx-auto max-w-[1800px] py-8 sm:py-12 lg:py-14">
      <div className="booking-breadcrumb">
        <Link href="/" className="label inline-flex items-center gap-2 text-neutral-500 hover:text-black"><ArrowLeft size={13} /> Back to Terasbarber</Link>
        <span className="label text-neutral-400">Appointments / 01</span>
      </div>
      <div className="booking-layout">
        <aside className="booking-intro min-w-0">
          <p className="label flex items-center gap-2 text-neutral-500"><CalendarDays size={14} /> Your time, your chair</p>
          <h1 className="display mt-5">BOOK.<br />YOUR CHAIR<span className="text-lime">.</span></h1>
          <p className="mt-5 max-w-sm text-sm leading-6 text-neutral-600">A good cut starts here. Choose your services, find your time, and leave the rest to us.</p>
          <div className="booking-guidance-card">
            <div><Clock3 size={17} /><p><strong>Made for your schedule</strong><span>Live availability, in the shop’s local time.</span></p></div>
            <div><MessageCircle size={17} /><p><strong>We’ll be in touch</strong><span>Your request is pending until the shop confirms it.</span></p></div>
          </div>
          <figure className="booking-intro-photo">
            <Image src="/images/service-haircut.jpg" alt="" fill sizes="(max-width: 1023px) 1px, 32vw" className="object-cover grayscale" />
            <figcaption><span>THE DETAILS MATTER.</span><span>Illustrative photo / 01</span></figcaption>
          </figure>
        </aside>
        <BookingForm services={services} barbers={barbers} timezone={timezone} today={today} horizonDays={horizonDays} configured={configured} initialServiceId={initialServiceId} initialBarberId={initialBarberId} loadError={loadError} />
      </div>
    </div>
  </main>;
}
