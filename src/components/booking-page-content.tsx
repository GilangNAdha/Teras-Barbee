import Link from 'next/link';
import { ArrowLeft, CalendarDays } from 'lucide-react';
import { BookingForm } from '@/components/booking-form';

type ServiceOption = { id: string; name: string; description: string; category: 'HAIRCUT' | 'COMBO' | 'BEARD'; image_url: string | null; price_idr: number; duration_minutes: number };
type BarberOption = { id: string; name: string; bio: string; specialties: string[]; serviceIds: string[] };

export function BookingPageContent({ services, barbers, timezone, today, horizonDays, configured, initialServiceId, initialBarberId }: {
  services: ServiceOption[]; barbers: BarberOption[]; timezone: string; today: string; horizonDays: number; configured: boolean; initialServiceId: string; initialBarberId: string;
}) {
  return <main id="main" lang="id" className="section-pad mx-auto min-h-[70vh] max-w-[1400px] py-8 sm:py-14">
    <div className="mb-9 flex flex-wrap items-center justify-between gap-4 border-b border-black/15 pb-4">
      <Link href="/" className="label inline-flex items-center gap-2 text-neutral-500"><ArrowLeft size={13} /> Kembali ke Terasbarber</Link>
    </div>
    <div className="grid gap-8 lg:grid-cols-[.8fr_1.2fr] lg:gap-16">
      <div className="lg:pt-3">
        <p className="label mb-5 flex items-center gap-2 text-neutral-500"><CalendarDays size={14} /> Permintaan appointment</p>
        <h1 className="display text-[clamp(58px,9vw,112px)]">PILIH.<br />PESAN.</h1>
        <p className="mt-6 max-w-sm text-sm leading-6 text-neutral-600">Pilih layanan dan barber, lalu tentukan waktu yang tersedia. Permintaan tersimpan dengan status menunggu konfirmasi dari shop.</p>
        <div className="mt-8 border-t border-black/20 pt-5 sm:mt-10"><span className="label text-neutral-500">Sebelum booking</span><ul className="mt-4 space-y-3 text-xs leading-5 text-neutral-600"><li>• Slot dicek langsung berdasarkan jadwal dan durasi layanan.</li><li>• Masukkan nomor WhatsApp yang aktif agar shop dapat menghubungi Anda.</li><li>• Booking berstatus menunggu konfirmasi sampai shop menyetujuinya.</li></ul></div>
      </div>
      <BookingForm services={services} barbers={barbers} timezone={timezone} today={today} horizonDays={horizonDays} configured={configured} initialServiceId={initialServiceId} initialBarberId={initialBarberId} />
    </div>
  </main>;
}
