'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CalendarDays } from 'lucide-react';
import { BookingForm } from '@/components/booking-form';

type BookingLanguage = 'id' | 'en';
type ServiceOption = { id: string; name: string; description: string; category: 'HAIRCUT' | 'COMBO' | 'BEARD'; image_url: string | null; price_idr: number; duration_minutes: number };
type BarberOption = { id: string; name: string; bio: string; specialties: string[]; serviceIds: string[] };

export function BookingPageContent({ services, barbers, timezone, today, horizonDays, configured, initialServiceId, initialBarberId }: {
  services: ServiceOption[]; barbers: BarberOption[]; timezone: string; today: string; horizonDays: number; configured: boolean; initialServiceId: string; initialBarberId: string;
}) {
  const [language, setLanguage] = useState<BookingLanguage>('id');
  const intro = language === 'id' ? {
    back: 'Kembali ke Terasbarber', eyebrow: 'Permintaan appointment', title: <>PILIH.<br />PESAN.</>,
    description: 'Pilih layanan dan barber, lalu tentukan waktu yang tersedia. Permintaan tersimpan dengan status menunggu konfirmasi dari shop.', before: 'Sebelum booking',
    points: ['Slot dicek langsung berdasarkan jadwal dan durasi layanan.', 'Masukkan nomor WhatsApp yang aktif agar shop dapat menghubungi Anda.', 'Booking berstatus menunggu konfirmasi sampai shop menyetujuinya.']
  } : {
    back: 'Back to Terasbarber', eyebrow: 'Appointment request', title: <>BOOK.<br />YOUR CHAIR.</>,
    description: 'Choose a service and barber, then pick an available time. Your request is saved as pending until the shop confirms it.', before: 'Before you book',
    points: ['Live slots account for the schedule and service duration.', 'Enter an active WhatsApp number so the shop can reach you.', 'Your appointment stays pending until the shop confirms it.']
  };

  return <main id="main" lang={language} className="section-pad mx-auto min-h-[70vh] max-w-[1400px] py-8 sm:py-14">
    <div className="mb-9 flex flex-wrap items-center justify-between gap-4 border-b border-black/15 pb-4">
      <Link href="/" className="label inline-flex items-center gap-2 text-neutral-500"><ArrowLeft size={13} /> {intro.back}</Link>
      <div role="group" aria-label="Choose language / Pilih bahasa" className="flex items-center border border-black/20 p-1">
        <button type="button" aria-pressed={language === 'id'} onClick={() => setLanguage('id')} className={`px-3 py-2 text-[10px] font-bold uppercase tracking-wide transition-colors ${language === 'id' ? 'bg-ink text-cream' : 'text-neutral-600 hover:text-ink'}`}>Bahasa Indonesia</button>
        <button type="button" aria-pressed={language === 'en'} onClick={() => setLanguage('en')} className={`px-3 py-2 text-[10px] font-bold uppercase tracking-wide transition-colors ${language === 'en' ? 'bg-ink text-cream' : 'text-neutral-600 hover:text-ink'}`}>English</button>
      </div>
    </div>
    <div className="grid gap-8 lg:grid-cols-[.8fr_1.2fr] lg:gap-16">
      <div className="lg:pt-3">
        <p className="label mb-5 flex items-center gap-2 text-neutral-500"><CalendarDays size={14} /> {intro.eyebrow}</p>
        <h1 className="display text-[clamp(58px,9vw,112px)]">{intro.title}</h1>
        <p className="mt-6 max-w-sm text-sm leading-6 text-neutral-600">{intro.description}</p>
        <div className="mt-8 border-t border-black/20 pt-5 sm:mt-10"><span className="label text-neutral-500">{intro.before}</span><ul className="mt-4 space-y-3 text-xs leading-5 text-neutral-600">{intro.points.map(point => <li key={point}>• {point}</li>)}</ul></div>
      </div>
      <BookingForm services={services} barbers={barbers} timezone={timezone} today={today} horizonDays={horizonDays} configured={configured} initialServiceId={initialServiceId} initialBarberId={initialBarberId} language={language} />
    </div>
  </main>;
}
