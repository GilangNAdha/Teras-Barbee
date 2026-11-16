import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft, CalendarDays, CreditCard, Scissors } from 'lucide-react';
import { BookingForm } from '@/components/booking-form';
import type { BookingBarber, BookingService } from '@/lib/booking-options';

export function BookingPageContent({ services, barbers, timezone, today, horizonDays, configured, initialServiceId, initialBarberId, loadError = false }: {
  services: BookingService[]; barbers: BookingBarber[]; timezone: string; today: string; horizonDays: number; configured: boolean; initialServiceId: string; initialBarberId: string; loadError?: boolean;
}) {
  const cheapest = services.reduce<number | null>((min, service) => min === null || service.price_idr < min ? service.price_idr : min, null);
  return <main id="main" lang="id" className="booking-page-shell">
    <div className="section-pad mx-auto max-w-[1800px] py-8 sm:py-12 lg:py-14">
      <div className="booking-breadcrumb">
        <Link href="/" className="label inline-flex items-center gap-2 text-neutral-500 hover:text-black"><ArrowLeft size={13} /> Kembali ke Terasbarber</Link>
        <span className="label text-neutral-400">Booking / 01</span>
      </div>
      <div className="booking-layout">
        <aside className="booking-intro min-w-0">
          <p className="label flex items-center gap-2 text-neutral-500"><Scissors size={14} /> Terasbarber · Barber &amp; Grooming</p>
          <h1 className="display mt-5">BOOKING<span className="text-lime">.</span></h1>
          <p className="mt-5 max-w-sm text-sm leading-6 text-neutral-600">
            Pilih kapster, jadwal, dan layanan favoritmu. Bayar dengan QRIS atau di barbershop.
            {cheapest !== null && <> Mulai dari <strong className="text-black">{new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(cheapest)}</strong>.</>}
          </p>
          <div className="booking-guidance-card">
            <div><CalendarDays size={17} /><p><strong>Jadwal real-time</strong><span>Slot yang tampil adalah jadwal kapster yang benar-benar kosong.</span></p></div>
            <div><CreditCard size={17} /><p><strong>Bayar fleksibel</strong><span>QRIS langsung dari e-wallet, atau tunai di barbershop.</span></p></div>
          </div>
          <figure className="booking-intro-photo">
            <Image src="/images/service-haircut.jpg" alt="" fill sizes="(max-width: 1023px) 1px, 32vw" className="object-cover grayscale" />
            <figcaption><span>Detail yang menentukan.</span><span>Foto ilustrasi / 01</span></figcaption>
          </figure>
        </aside>
        <BookingForm services={services} barbers={barbers} timezone={timezone} today={today} horizonDays={horizonDays} configured={configured} initialServiceId={initialServiceId} initialBarberId={initialBarberId} loadError={loadError} />
      </div>
    </div>
  </main>;
}
