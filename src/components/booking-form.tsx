'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, ArrowUpRight, CalendarDays, Check, Clock3, LoaderCircle } from 'lucide-react';
import { idr } from '@/lib/format';
import { serviceImage, serviceImageIsIllustrative, type ServiceCategory } from '@/lib/service-visual';
import { bookingSlotKey, type BookingSlot } from '@/lib/booking-slots';

type ServiceOption = { id: string; name: string; description: string; category: ServiceCategory; image_url: string | null; price_idr: number; duration_minutes: number };
type BarberOption = { id: string; name: string; serviceIds: string[]; bio: string; specialties: string[] };
type Completed = { code: string; service: string; barber: string; startsAt: string; manageUrl: string };
const steps = ['Layanan', 'Waktu', 'Data diri', 'Konfirmasi'];

function timeLabel(value: string, timezone: string) {
  return new Intl.DateTimeFormat('id-ID', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(value));
}
function dateAtTimezone(date: string, timezone: string) {
  return new Intl.DateTimeFormat('id-ID', { timeZone: timezone, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(date));
}

export function BookingForm({ services, barbers, timezone, today, horizonDays, configured, initialServiceId = '', initialBarberId = '' }: {
  services: ServiceOption[]; barbers: BarberOption[]; timezone: string; today: string; horizonDays: number; configured: boolean; initialServiceId?: string; initialBarberId?: string;
}) {
  const maxDate = useMemo(() => {
    const [year, month, day] = today.split('-').map(Number);
    const limit = new Date(Date.UTC(year, month - 1, day + horizonDays));
    return limit.toISOString().slice(0, 10);
  }, [today, horizonDays]);
  const [step, setStep] = useState(initialServiceId ? 2 : 1);
  const [serviceId, setServiceId] = useState(initialServiceId);
  const [barberFilter, setBarberFilter] = useState(initialBarberId);
  const [date, setDate] = useState(today);
  const [slots, setSlots] = useState<BookingSlot[]>([]);
  const [slotValue, setSlotValue] = useState('');
  const [loadingSlots, setLoadingSlots] = useState(Boolean(configured && initialServiceId));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [completed, setCompleted] = useState<Completed | null>(null);
  const [whatsappUrl, setWhatsappUrl] = useState<string | null>(null);
  const [whatsappRecipient, setWhatsappRecipient] = useState<'barber' | 'shop'>('shop');
  const [consent, setConsent] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!configured || !serviceId || !date) return;
    const controller = new AbortController();
    const query = new URLSearchParams({ date, serviceId });
    if (barberFilter) query.set('barberId', barberFilter);
    fetch(`/api/availability?${query}`, { signal: controller.signal, cache: 'no-store' })
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'Jadwal tidak dapat dimuat.');
        return body.slots as BookingSlot[];
      })
      .then(data => { setSlots(data); setSlotValue(''); setError(''); })
      .catch(reason => { if (reason.name !== 'AbortError') { setSlots([]); setError(reason.message); } })
      .finally(() => { if (!controller.signal.aborted) setLoadingSlots(false); });
    return () => controller.abort();
  }, [configured, serviceId, barberFilter, date]);

  const selectedSlot = slots.find(slot => bookingSlotKey(slot) === slotValue);
  const selectedService = services.find(service => service.id === serviceId);
  const selectedBarber = selectedSlot?.barber_name || (barberFilter ? barbers.find(barber => barber.id === barberFilter)?.name : null) || 'Barber tersedia';
  const eligibleBarbers = serviceId ? barbers.filter(barber => barber.serviceIds.includes(serviceId)) : barbers;

  function chooseService(id: string) {
    setServiceId(id);
    if (barberFilter && !barbers.find(barber => barber.id === barberFilter)?.serviceIds.includes(id)) setBarberFilter('');
    setSlots([]); setSlotValue(''); setError(''); setLoadingSlots(Boolean(configured));
  }
  function goToStep(next: number) {
    setError(''); setStep(Math.min(4, Math.max(1, next)));
  }
  function continueToTime() {
    if (!selectedService) { setError('Pilih layanan terlebih dahulu.'); return; }
    goToStep(2);
  }
  function continueToDetails() {
    if (!selectedSlot) { setError('Pilih tanggal dan jam yang tersedia.'); return; }
    goToStep(3);
  }
  function continueToReview() {
    if (customerName.trim().length < 2) { setError('Masukkan nama lengkap (minimal 2 karakter).'); return; }
    if (!/^\+?[0-9][0-9\s()-]{7,19}$/.test(customerPhone.trim())) { setError('Masukkan nomor WhatsApp yang valid, termasuk kode negara bila tersedia.'); return; }
    if (!consent) { setError('Setujui kebijakan privasi dan booking untuk melanjutkan.'); return; }
    goToStep(4);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (step !== 4 || !selectedService || !selectedSlot) { setError('Lengkapi langkah booking terlebih dahulu.'); return; }
    if (!consent) { setError('Setujui kebijakan privasi dan booking untuk melanjutkan.'); setStep(3); return; }
    setSubmitting(true);
    try {
      const response = await fetch('/api/bookings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceId,
          barberId: selectedSlot.barber_id,
          startsAt: selectedSlot.starts_at,
          customerName,
          customerPhone,
          notes
        })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Booking belum dapat disimpan. Coba lagi.');
      setCompleted({ ...body.booking, manageUrl: body.manageUrl });
      setWhatsappUrl(body.whatsappUrl);
      setWhatsappRecipient(body.whatsappRecipient === 'barber' ? 'barber' : 'shop');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Booking belum dapat disimpan. Coba lagi.');
      if (reason instanceof Error && /taken|diambil|terisi/i.test(reason.message)) { setSlotValue(''); setStep(2); }
    } finally { setSubmitting(false); }
  }

  if (completed) return <section aria-live="polite" className="border border-ink bg-lime p-6 sm:p-9">
    <div className="mb-5 grid size-10 place-items-center border border-ink"><Check size={20} /></div>
    <p className="label mb-3">Permintaan tersimpan · {completed.code}</p>
    <h2 className="display text-4xl sm:text-6xl">SATU LANGKAH<br />LAGI.</h2>
    <p className="mt-4 max-w-lg text-sm leading-6">Permintaan {completed.service} dengan {completed.barber} pada {dateAtTimezone(completed.startsAt, timezone)} pukul {timeLabel(completed.startsAt, timezone)} sudah tersimpan dengan status <strong>menunggu konfirmasi</strong> dari shop.</p>
    {whatsappUrl ? <a className="btn-dark mt-7" href={whatsappUrl} target="_blank" rel="noreferrer">Hubungi {whatsappRecipient === 'barber' ? completed.barber : 'shop'} via WhatsApp <ArrowUpRight size={15} /></a> : <p className="mt-6 border-t border-black/20 pt-4 text-xs">Kontak WhatsApp belum tersedia. Booking tetap tersimpan; simpan kode booking dan tunggu konfirmasi shop.</p>}
    <Link href={completed.manageUrl} className="btn-outline mt-4 w-full sm:w-auto">Lihat / ubah booking <ArrowUpRight size={14} /></Link>
    <p className="mt-5 text-[10px] font-semibold uppercase tracking-[.12em]">Kode booking: {completed.code}</p>
    <button type="button" className="label mt-7 flex items-center gap-2 underline underline-offset-4" onClick={() => { setCompleted(null); setWhatsappUrl(null); setStep(1); setServiceId(''); setSlotValue(''); }}><ArrowLeft size={13} /> Booking lagi</button>
  </section>;

  return <form onSubmit={submit} className="border border-black/20 bg-cream p-5 sm:p-8">
    {!configured && <div role="status" className="mb-6 border-l-4 border-lime bg-white p-4 text-sm">Booking online belum aktif. Database, jadwal shop, dan konfigurasi server perlu disiapkan terlebih dahulu.</div>}
    <div className="mb-7 border-b border-black/20 pb-5">
      <div className="mb-4 flex items-center justify-between gap-4"><span className="label">Buat appointment</span><span className="label text-neutral-500">LANGKAH {step} / 4</span></div>
      <ol className="grid grid-cols-4 gap-2" aria-label="Progress booking">
        {steps.map((label, index) => {
          const number = index + 1;
          const reached = number <= step;
          return <li key={label}>
            <button type="button" disabled={number >= step} onClick={() => goToStep(number)} aria-current={number === step ? 'step' : undefined} className={`flex w-full items-center gap-2 border-t-2 pt-2 text-left transition-colors ${reached ? 'border-ink text-ink' : 'border-black/15 text-neutral-400'} disabled:cursor-default`}>
              <span className={`grid size-6 shrink-0 place-items-center text-[10px] font-bold ${number === step ? 'bg-ink text-cream' : reached ? 'border border-ink' : 'border border-black/20'}`}>{number < step ? <Check size={12} /> : number}</span>
              <span className="hidden text-[10px] font-bold uppercase tracking-wide sm:inline">{label}</span>
            </button>
          </li>;
        })}
      </ol>
    </div>

    {error && <div role="alert" className="mb-5 border border-red-800/25 bg-red-50 p-3 text-sm text-red-900">{error}</div>}

    {step === 1 && <section aria-labelledby="booking-step-service">
      <h2 id="booking-step-service" className="label mb-4">01 / Pilih layanan</h2>
      {services.length ? <div className="booking-service-grid grid gap-3 sm:grid-cols-2 xl:grid-cols-3" role="group" aria-label="Pilih layanan">
        {services.map(service => {
          const image = serviceImage(service);
          const illustrative = serviceImageIsIllustrative(service);
          const selected = serviceId === service.id;
          return <button key={service.id} type="button" disabled={!configured} aria-pressed={selected} onClick={() => chooseService(service.id)} className={`booking-service-card text-left ${selected ? 'is-selected' : ''}`}>
            <div className="booking-service-image image-frame relative aspect-[4/3] bg-[#d8d4cc]"><Image src={image} alt={illustrative ? `Ilustrasi layanan ${service.category.toLowerCase()}` : `Layanan ${service.name}`} fill sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw" unoptimized className="object-cover grayscale transition-transform duration-500" />{illustrative && <span className="absolute bottom-2 left-2 bg-ink/85 px-2 py-1 text-[8px] font-bold uppercase tracking-[.12em] text-white">Foto ilustrasi</span>}</div>
            <span className="booking-service-info block p-3 sm:p-4"><span className="flex items-center justify-between gap-2"><span className="label text-neutral-500">{service.category} / {service.duration_minutes} menit</span><span className="text-xs font-bold">{idr(service.price_idr)}</span></span><span className="display mt-3 block text-2xl">{service.name}</span>{service.description && <span className="mt-2 block line-clamp-2 text-xs leading-5 text-neutral-600">{service.description}</span>}</span>
          </button>;
        })}
      </div> : <p className="border border-black/15 px-4 py-5 text-sm text-neutral-600">Layanan belum tersedia. Silakan hubungi shop.</p>}
      <div className="mt-6 flex justify-end"><button type="button" className="btn-primary w-full justify-center sm:w-auto" disabled={!configured || !selectedService} onClick={continueToTime}>Pilih barber & waktu <ArrowRight size={15} /></button></div>
    </section>}

    {step === 2 && <section aria-labelledby="booking-step-time">
      <div className="mb-5 flex items-center justify-between gap-4"><h2 id="booking-step-time" className="label">02 / Pilih barber & waktu</h2><button type="button" className="label inline-flex items-center gap-1 text-neutral-500 underline" onClick={() => goToStep(1)}><ArrowLeft size={12} /> Ubah layanan</button></div>
      {selectedService && <p className="mb-4 border-l-2 border-lime pl-3 text-xs text-neutral-600">{selectedService.name} · {selectedService.duration_minutes} menit · {idr(selectedService.price_idr)}</p>}
      <p className="label mb-2">Barber</p>
      <div className="mb-5 grid gap-2 sm:grid-cols-2">
        <button type="button" disabled={!configured || !selectedService} aria-pressed={!barberFilter} onClick={() => { setBarberFilter(''); setSlots([]); setSlotValue(''); setError(''); setLoadingSlots(Boolean(configured && serviceId)); }} className={`border p-3 text-left transition-colors ${!barberFilter ? 'border-ink bg-ink text-cream' : 'border-black/20 hover:border-black'}`}>
          <span className="label block">Tanpa preferensi</span><span className={`mt-1 block text-xs ${!barberFilter ? 'text-white/70' : 'text-neutral-500'}`}>Pilih barber yang tersedia untuk jam ini.</span>
        </button>
        {eligibleBarbers.map(barber => <button key={barber.id} type="button" disabled={!configured} aria-pressed={barberFilter === barber.id} onClick={() => { setBarberFilter(barber.id); setSlots([]); setSlotValue(''); setError(''); setLoadingSlots(Boolean(configured && serviceId)); }} className={`border p-3 text-left transition-colors ${barberFilter === barber.id ? 'border-ink bg-ink text-cream' : 'border-black/20 hover:border-black'}`}>
          <span className="label block">{barber.name}</span><span className={`mt-1 block line-clamp-2 text-xs ${barberFilter === barber.id ? 'text-white/70' : 'text-neutral-500'}`}>{barber.specialties.length ? barber.specialties.join(' · ') : barber.bio || 'Barber tersedia untuk layanan ini.'}</span>
        </button>)}
        {selectedService && eligibleBarbers.length === 0 && <p className="border border-black/15 p-3 text-xs text-neutral-600">Belum ada barber aktif untuk layanan ini.</p>}
      </div>
      <label className="mb-5 block"><span className="label mb-2 flex items-center gap-2"><CalendarDays size={13} /> Tanggal</span><input className="form-field" type="date" min={today} max={maxDate} value={date} onChange={event => { setDate(event.target.value); setSlots([]); setSlotValue(''); setError(''); setLoadingSlots(Boolean(configured && serviceId && event.target.value)); }} required disabled={!configured || !serviceId} /></label>
      <div>
        <p className="label mb-2 flex items-center justify-between">Jam tersedia {loadingSlots && <LoaderCircle className="animate-spin" size={15} />}</p>
        {loadingSlots ? <p className="border border-black/15 px-4 py-5 text-sm text-neutral-500">Memeriksa jadwal…</p> : slots.length ? <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{slots.map(slot => {
          const key = bookingSlotKey(slot);
          const active = key === slotValue;
          return <button key={key} type="button" aria-pressed={active} onClick={() => { setSlotValue(key); setError(''); }} className={`border px-3 py-3 text-left transition-colors ${active ? 'border-ink bg-lime' : 'border-black/20 bg-white/40 hover:border-black'}`}>
            <span className="display block text-xl">{timeLabel(slot.starts_at, timezone)}</span><span className="mt-1 block text-[10px] text-neutral-500">{slot.barber_name}</span>
          </button>;
        })}</div> : <p className="border border-black/15 px-4 py-5 text-sm text-neutral-600">Tidak ada jam tersedia untuk tanggal ini. Coba tanggal atau barber lain.</p>}
        <p className="mt-2 flex items-center gap-1 text-[10px] text-neutral-500"><Clock3 size={11} /> Waktu mengikuti zona {timezone}. Durasi layanan diperhitungkan otomatis.</p>
      </div>
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between"><button type="button" className="btn-outline w-full justify-center sm:w-auto" onClick={() => goToStep(1)}><ArrowLeft size={14} /> Kembali</button><button type="button" className="btn-primary w-full justify-center sm:w-auto" disabled={!selectedSlot} onClick={continueToDetails}>Lanjut ke data diri <ArrowRight size={15} /></button></div>
    </section>}

    {step === 3 && <section aria-labelledby="booking-step-details">
      <h2 id="booking-step-details" className="label mb-5">03 / Data pelanggan</h2>
      <div className="mb-5 border border-black/15 bg-white/40 p-4 text-xs leading-5 text-neutral-600"><strong className="text-ink">{selectedService?.name}</strong> dengan <strong className="text-ink">{selectedBarber}</strong><br />{selectedSlot && `${dateAtTimezone(selectedSlot.starts_at, timezone)} · ${timeLabel(selectedSlot.starts_at, timezone)}`}</div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label><span className="label mb-2 block">Nama lengkap</span><input className="form-field" name="customerName" type="text" minLength={2} maxLength={80} autoComplete="name" placeholder="Nama Anda" value={customerName} onChange={event => setCustomerName(event.target.value)} required disabled={!configured} /></label>
        <label><span className="label mb-2 block">Nomor WhatsApp</span><input className="form-field" name="customerPhone" type="tel" minLength={8} maxLength={24} autoComplete="tel" placeholder="+62…" value={customerPhone} onChange={event => setCustomerPhone(event.target.value)} required disabled={!configured} /></label>
        <label className="sm:col-span-2"><span className="label mb-2 block">Catatan untuk barber <span className="font-normal normal-case tracking-normal">(opsional)</span></span><textarea className="form-field min-h-24 resize-y" name="notes" maxLength={500} placeholder="Preferensi potongan atau informasi lain" value={notes} onChange={event => setNotes(event.target.value)} disabled={!configured} /></label>
      </div>
      <label className="mt-5 flex items-start gap-3 text-xs leading-5 text-neutral-600"><input className="mt-1 accent-black" type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} disabled={!configured} /><span>Saya setuju data ini digunakan untuk mengelola appointment. Baca <Link href="/privacy" className="underline">kebijakan privasi</Link>.</span></label>
      <p className="mt-4 text-[10px] leading-5 text-neutral-500">Booking akan berstatus menunggu konfirmasi. Shop dapat menghubungi Anda melalui WhatsApp.</p>
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between"><button type="button" className="btn-outline w-full justify-center sm:w-auto" onClick={() => goToStep(2)}><ArrowLeft size={14} /> Kembali</button><button type="button" className="btn-primary w-full justify-center sm:w-auto" disabled={!configured} onClick={continueToReview}>Lihat ringkasan <ArrowRight size={15} /></button></div>
    </section>}

    {step === 4 && selectedService && selectedSlot && <section aria-labelledby="booking-step-review">
      <h2 id="booking-step-review" className="label mb-5">04 / Periksa booking Anda</h2>
      <dl className="border-y border-black/20">
        <Summary label="Layanan" value={selectedService.name} detail={`${selectedService.duration_minutes} menit`} />
        <Summary label="Barber" value={selectedSlot.barber_name} />
        <Summary label="Tanggal & jam" value={`${dateAtTimezone(selectedSlot.starts_at, timezone)} · ${timeLabel(selectedSlot.starts_at, timezone)}`} />
        <Summary label="Nama" value={customerName.trim()} />
        <Summary label="WhatsApp" value={customerPhone.trim()} />
        {notes.trim() && <Summary label="Catatan" value={notes.trim()} />}
        <Summary label="Harga" value={idr(selectedService.price_idr)} strong />
      </dl>
      <p className="mt-4 text-xs leading-5 text-neutral-600">Dengan mengirim booking, Anda meminta appointment dan setuju shop menghubungi Anda. Booking belum terkonfirmasi sampai shop mengonfirmasi. Jadwal diamankan setelah permintaan berhasil disimpan.</p>
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between"><button type="button" className="btn-outline w-full justify-center sm:w-auto" disabled={submitting} onClick={() => goToStep(3)}><ArrowLeft size={14} /> Ubah data</button><button type="submit" className="btn-primary w-full justify-center disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto" disabled={!configured || submitting}>{submitting ? <>Menyimpan booking… <LoaderCircle className="animate-spin" size={15} /></> : <>Konfirmasi booking <ArrowUpRight size={15} /></>}</button></div>
    </section>}
  </form>;
}

function Summary({ label, value, detail, strong = false }: { label: string; value: string; detail?: string; strong?: boolean }) {
  return <div className="flex items-start justify-between gap-4 border-b border-black/10 py-3 last:border-b-0"><dt className="label shrink-0 text-neutral-500">{label}</dt><dd className={`max-w-[70%] text-right text-sm ${strong ? 'font-bold' : ''}`}>{value}{detail && <span className="mt-1 block text-xs font-normal text-neutral-500">{detail}</span>}</dd></div>;
}
