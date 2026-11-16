'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowLeft, ArrowRight, ArrowUpRight, CalendarDays, Check, ChevronLeft, ChevronRight,
  Clock3, CreditCard, LoaderCircle, QrCode, Scissors, ShieldCheck, Store, UserRound
} from 'lucide-react';
import { addCalendarDays, calendarDateLabel, calendarMonthDates, calendarMonthLabel, shiftCalendarMonth, startOfCalendarMonth } from '@/lib/booking-calendar';
import type { BookingBarber, BookingService } from '@/lib/booking-options';
import { idr } from '@/lib/format';
import { serviceImage, serviceImageIsIllustrative, type ServiceCategory } from '@/lib/service-visual';
import { isValidWhatsapp } from '@/lib/validation/booking';
import { PaymentPanel, type PaymentMethod, type PaymentSnapshot, type PaymentStatus } from '@/components/payment-panel';

type Completed = {
  code: string; service: string; barber: string; startsAt: string; price: number; duration: number;
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'no_show'; manageUrl: string;
};
type DateAvailability = { booking_date: string; is_available: boolean };
type ScheduleSlot = { starts_at: string; barber_id: string; barber_name: string; is_available: boolean; max_duration_minutes: number };
type FetchState = 'idle' | 'loading' | 'ready' | 'error';
type FieldErrors = { name?: string; phone?: string; consent?: string };

const steps = [
  { short: 'Kapster', title: 'Pilih Kapster' },
  { short: 'Jadwal', title: 'Pilih Jadwal' },
  { short: 'Layanan', title: 'Pilih Layanan' },
  { short: 'Checkout', title: 'Konfirmasi & Bayar' }
] as const;
const weekdays = ['S', 'S', 'R', 'K', 'J', 'S', 'M'];
const categoryNames: Record<ServiceCategory, string> = { HAIRCUT: 'Potong rambut', COMBO: 'Paket kombo', BEARD: 'Jenggot & kumis' };

function timeLabel(value: string, timezone: string) {
  return new Intl.DateTimeFormat('id-ID', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(value));
}
function dateTimeLabel(value: string, timezone: string) {
  return new Intl.DateTimeFormat('id-ID', { timeZone: timezone, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(value));
}
function apiMessage(reason: unknown, fallback: string) {
  return reason instanceof Error && reason.message ? reason.message : fallback;
}
async function readResponse(response: Response) {
  const body = await response.json();
  if (!response.ok) throw new Error(typeof body.error === 'string' ? body.error : 'Terjadi kesalahan. Silakan coba lagi.');
  return body;
}

export function BookingForm({ services, barbers, timezone, today, horizonDays, configured, initialServiceId = '', initialBarberId = '', loadError = false }: {
  services: BookingService[]; barbers: BookingBarber[]; timezone: string; today: string; horizonDays: number; configured: boolean; initialServiceId?: string; initialBarberId?: string; loadError?: boolean;
}) {
  const [step, setStep] = useState(1);
  const [hydrated, setHydrated] = useState(false);
  const [barberId, setBarberId] = useState(initialBarberId);
  const [month, setMonth] = useState(startOfCalendarMonth(today));
  const [date, setDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [schedule, setSchedule] = useState<ScheduleSlot[]>([]);
  const [scheduleState, setScheduleState] = useState<FetchState>('idle');
  const [scheduleError, setScheduleError] = useState('');
  const [calendar, setCalendar] = useState<DateAvailability[]>([]);
  const [calendarState, setCalendarState] = useState<FetchState>('idle');
  const [calendarError, setCalendarError] = useState('');
  const [serviceIds, setServiceIds] = useState<string[]>(initialServiceId ? [initialServiceId] : []);
  const [refresh, setRefresh] = useState(0);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [consent, setConsent] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('qris');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState<Completed | null>(null);
  const [payment, setPayment] = useState<PaymentSnapshot | null>(null);
  const [pollUrl, setPollUrl] = useState<string | null>(null);
  const [whatsappUrl, setWhatsappUrl] = useState<string | null>(null);
  const [whatsappRecipient, setWhatsappRecipient] = useState<'barber' | 'shop'>('shop');
  const submittingRef = useRef(false);
  const requestIdRef = useRef<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const successRef = useRef<HTMLElement>(null);

  const selectedBarber = barberId ? barbers.find(barber => barber.id === barberId) ?? null : null;
  const eligibleServices = useMemo(
    () => services.filter(service => !barberId || (selectedBarber?.serviceIds ?? []).includes(service.id)),
    [services, barberId, selectedBarber]
  );
  const selectedServices = serviceIds.map(id => services.find(service => service.id === id)).filter((service): service is BookingService => Boolean(service));
  const totalPrice = selectedServices.reduce((sum, service) => sum + service.price_idr, 0);
  const totalDuration = selectedServices.reduce((sum, service) => sum + service.duration_minutes, 0);
  const maxDate = addCalendarDays(today, horizonDays);
  const monthDates = useMemo(() => calendarMonthDates(month), [month]);
  const calendarMap = useMemo(() => new Map(calendar.map(item => [item.booking_date, item.is_available])), [calendar]);
  const selectedSlot = schedule.find(slot => slot.starts_at === selectedTime && slot.is_available);
  const bookingEnabled = configured && !loadError && hydrated;
  const bookedOut = Boolean(completed);

  useEffect(() => {
    // Keep server-rendered controls disabled until their event handlers are ready.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHydrated(true);
  }, []);

  // Step 2 shows the barber's own calendar; the shop-wide calendar is not needed
  // until a service duration has to fit inside a slot.
  useEffect(() => {
    if (!bookingEnabled || !barberId || step !== 2) return;
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Reset the calendar while the selected month is fetched.
    setCalendarState('loading');
    setCalendarError('');
    const query = new URLSearchParams({ view: 'calendar', barberId, from: monthDates.first, to: monthDates.last });
    fetch(`/api/availability?${query}`, { signal: controller.signal, cache: 'no-store' })
      .then(readResponse)
      .then(body => { setCalendar(body.dates as DateAvailability[]); setCalendarState('ready'); })
      .catch(reason => { if (!controller.signal.aborted) { setCalendar([]); setCalendarState('error'); setCalendarError(apiMessage(reason, 'Jadwal belum bisa dimuat.')); } });
    return () => controller.abort();
  }, [bookingEnabled, barberId, monthDates.first, monthDates.last, step, refresh]);

  useEffect(() => {
    if (!bookingEnabled || !barberId || !date || step !== 2) return;
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Prevent a stale slot from being used while rechecking.
    setScheduleState('loading');
    setScheduleError('');
    const query = new URLSearchParams({ barberId, date, includeUnavailable: '1' });
    fetch(`/api/availability?${query}`, { signal: controller.signal, cache: 'no-store' })
      .then(readResponse)
      .then(body => {
        const next = body.slots as ScheduleSlot[];
        setSchedule(next);
        setSelectedTime(previous => next.some(slot => slot.starts_at === previous && slot.is_available) ? previous : '');
        setScheduleState('ready');
      })
      .catch(reason => { if (!controller.signal.aborted) { setSchedule([]); setSelectedTime(''); setScheduleState('error'); setScheduleError(apiMessage(reason, 'Jadwal belum bisa dimuat.')); } });
    return () => controller.abort();
  }, [bookingEnabled, barberId, date, step, refresh]);

  function resetRequest() { requestIdRef.current = null; }
  function resetTime() { setDate(''); setSelectedTime(''); setSchedule([]); setScheduleState('idle'); resetRequest(); }
  function goToStep(next: number) {
    if (submittingRef.current) return;
    setError('');
    setStep(Math.max(1, Math.min(4, next)));
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function chooseBarber(id: string) {
    if (id === barberId) return;
    setBarberId(id);
    // Services are tied to the chosen barber, so a barber change can invalidate them.
    setServiceIds(previous => previous.filter(serviceId => (barbers.find(barber => barber.id === id)?.serviceIds ?? []).includes(serviceId)));
    resetTime();
    setError('');
  }
  function moveMonth(direction: number) {
    setMonth(shiftCalendarMonth(month, direction));
    resetTime();
    setError('');
  }
  function chooseDate(value: string) {
    setDate(value); setSelectedTime(''); setSchedule([]); setScheduleState('loading'); setError(''); resetRequest();
  }
  function toggleService(id: string) {
    const next = serviceIds.includes(id) ? serviceIds.filter(item => item !== id) : [...serviceIds, id];
    const duration = services.filter(service => next.includes(service.id)).reduce((sum, service) => sum + service.duration_minutes, 0);
    if (next.length > 5 || duration > 600) { setError('Maksimal 5 layanan dengan total durasi 10 jam.'); return; }
    setServiceIds(next);
    setError('');
  }
  const slotFits = (slot: ScheduleSlot | undefined, duration: number) => Boolean(slot?.is_available && slot.max_duration_minutes >= duration);

  function validateDetails() {
    const next: FieldErrors = {};
    if (customerName.trim().length < 2) next.name = 'Masukkan nama lengkap Anda (minimal 2 karakter).';
    if (!isValidWhatsapp(customerPhone)) next.phone = 'Masukkan nomor WhatsApp yang valid, contoh 0812 3456 7890.';
    if (!consent) next.consent = 'Centang persetujuan agar kami dapat menyimpan data booking Anda.';
    setFieldErrors(next);
    if (Object.keys(next).length) { setError('Periksa kembali data yang ditandai di bawah ini.'); return false; }
    return true;
  }
  function continueToCheckout() {
    if (!selectedBarber) { setError('Pilih kapster terlebih dahulu.'); setStep(1); return; }
    if (!selectedSlot) { setError('Pilih jadwal terlebih dahulu.'); setStep(2); return; }
    if (!selectedServices.length) { setError('Pilih minimal satu layanan.'); setStep(3); return; }
    if (!slotFits(selectedSlot, totalDuration)) {
      setError('Waktu yang dipilih tidak cukup untuk layanan ini. Pilih layanan lain atau pilih jadwal ulang.');
      setStep(2);
      return;
    }
    goToStep(4);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current) return;
    if (step !== 4 || !selectedServices.length || !selectedSlot || !bookingEnabled) { setError('Lengkapi langkah booking terlebih dahulu.'); return; }
    if (!validateDetails()) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError('');
    requestIdRef.current ??= crypto.randomUUID();
    try {
      const response = await fetch('/api/bookings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceIds, barberId: barberId || null, startsAt: selectedSlot.starts_at,
          customerName: customerName.trim(), customerPhone: customerPhone.trim(), notes: notes.trim(),
          requestId: requestIdRef.current, expectedPrice: totalPrice, expectedDuration: totalDuration,
          paymentMethod
        })
      });
      const body = await readResponse(response);
      setCompleted({ ...body.booking, manageUrl: body.manageUrl });
      setWhatsappUrl(body.whatsappUrl ?? null);
      setWhatsappRecipient(body.whatsappRecipient === 'barber' ? 'barber' : 'shop');
      const result = body.payment as {
        method: PaymentMethod; status: PaymentStatus; qrImageUrl: string | null; expiresAt: string | null; fallback: boolean; error: string | null;
      } | undefined;
      if (result) {
        setPayment({
          method: result.method,
          status: result.status,
          qrImageUrl: result.qrImageUrl,
          expiresAt: result.expiresAt,
          note: result.fallback
            ? (result.error || 'QRIS belum tersedia, silakan bayar di barbershop.')
            : null
        });
        setPollUrl(result.method === 'qris' ? `/api/manage-booking/${body.manageUrl.split('/').pop()}/payment` : null);
      }
      requestAnimationFrame(() => successRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    } catch (reason) {
      const message = apiMessage(reason, 'Booking tidak dapat disimpan. Silakan coba lagi.');
      if (/slot was just taken/i.test(message)) {
        setSelectedTime(''); setStep(2); setRefresh(value => value + 1);
        setError('Jadwal tersebut baru saja diambil. Ketersediaan sudah diperbarui, silakan pilih jam lain.');
      } else if (reason instanceof TypeError) {
        setError('Koneksi ke server terputus. Coba kirim ulang tanpa mengubah data — permintaan yang sama tidak akan tercatat dua kali.');
      } else setError(message);
    } finally { submittingRef.current = false; setSubmitting(false); }
  }

  if (completed) {
    const isQris = payment?.method === 'qris';
    return <section ref={successRef} aria-live="polite" className="booking-success">
      <div className="booking-success-check"><Check size={22} /></div>
      <p className="label mt-6 text-lime">Booking diterima / {completed.code}</p>
      <h2 className="display mt-4">BOOKING<br />BERHASIL<span className="text-lime">.</span></h2>
      <p className="mt-5 max-w-lg text-sm leading-6 text-white/70">
        {isQris && payment?.status === 'pending'
          ? <>Selesaikan pembayaran QRIS di bawah ini. Jadwal Anda otomatis dikonfirmasi setelah pembayaran masuk.</>
          : payment?.method === 'pay_at_barber'
            ? <>Jadwal Anda sudah tercatat. Silakan <strong className="text-white">bayar di barbershop</strong> saat datang.</>
            : <>Permintaan Anda <strong className="text-white">menunggu konfirmasi</strong> shop. Slot ditahan selama 30 menit.</>}
      </p>
      <dl className="booking-success-summary">
        <Summary label="Layanan" value={completed.service} detail={`${completed.duration} menit`} />
        <Summary label="Kapster" value={completed.barber} />
        <Summary label="Jadwal" value={`${dateTimeLabel(completed.startsAt, timezone)} · ${timeLabel(completed.startsAt, timezone)}`} />
        <Summary label="Total" value={idr(completed.price)} strong />
      </dl>
      {payment && <PaymentPanel className="booking-success-payment" payment={payment} pollUrl={pollUrl} price={completed.price} />}
      <div className="mt-7 flex flex-wrap gap-3">
        <Link href={completed.manageUrl} className="btn-primary">Kelola booking <ArrowUpRight size={14} /></Link>
        {whatsappUrl && <a className="booking-success-link" href={whatsappUrl} target="_blank" rel="noreferrer">Chat {whatsappRecipient === 'barber' ? completed.barber : 'shop'} via WhatsApp <ArrowUpRight size={14} /></a>}
      </div>
      <p className="mt-4 text-xs leading-5 text-white/55">Simpan tautan kelola booking untuk melihat, menjadwal ulang, atau membatalkan janji temu.</p>
      <button type="button" className="label mt-8 inline-flex items-center gap-2 text-white/70 underline underline-offset-4" onClick={() => {
        setCompleted(null); setPayment(null); setPollUrl(null); setWhatsappUrl(null); setStep(1); setServiceIds([]); setBarberId('');
        resetTime(); setCustomerName(''); setCustomerPhone(''); setNotes(''); setConsent(false); setPaymentMethod('qris');
        setFieldErrors({}); setError('');
      }}><ArrowLeft size={13} /> Booking lagi</button>
    </section>;
  }

  const compactSummary = [
    selectedBarber ? selectedBarber.name : 'Belum dipilih',
    date && selectedTime ? `${calendarDateLabel(date)} · ${timeLabel(selectedTime, timezone)}` : null,
    selectedServices.length ? `${selectedServices.length} layanan · ${idr(totalPrice)}` : null
  ].filter(Boolean) as string[];

  return <form ref={formRef} onSubmit={submit} className="booking-glass-panel" aria-busy={!hydrated} noValidate>
    <div className="booking-panel-heading">
      <div><p className="label text-neutral-500">Terasbarber / Booking</p><p className="mt-2 text-sm font-bold">Booking</p></div>
      <span className="booking-step-count">{String(step).padStart(2, '0')} <span>/ 04</span></span>
    </div>
    <ol className="booking-progress" aria-label="Langkah booking">
      {steps.map((item, index) => {
        const number = index + 1;
        return <li key={item.short}><button type="button" disabled={number >= step || submitting || bookedOut} onClick={() => goToStep(number)} aria-current={number === step ? 'step' : undefined} className={number === step ? 'is-current' : number < step ? 'is-complete' : ''}>
          <span className="booking-progress-number">{number < step ? <Check size={13} /> : String(number).padStart(2, '0')}</span><span>{item.short}</span>
        </button></li>;
      })}
    </ol>
    {loadError ? <div role="alert" className="booking-notice is-error"><strong>Menu booking gagal dimuat.</strong><span> Periksa koneksi lalu muat ulang halaman.</span> <a href="/book" className="underline">Muat ulang</a></div> : !configured && <div role="status" className="booking-notice"><strong>Booking online belum aktif.</strong><span> Shop masih menyiapkan layanan dan jadwal. Silakan cek kembali nanti.</span></div>}
    {error && <div role="alert" className="booking-notice is-error">{error}{/refresh the page/i.test(error) && <> <a href="/book" className="underline">Muat ulang</a></>}</div>}

    {!loadError && step === 1 && <section aria-labelledby="booking-step-barber">
      <StepHeading number="01" id="booking-step-barber" title="Pilih Kapster" description="Jadwal dan layanan yang tampil menyesuaikan kapster pilihan kamu." />
      {barbers.length ? <div className="booking-kapster-grid" role="group" aria-label="Pilih kapster">
        {barbers.map(barber => <button key={barber.id} type="button" aria-pressed={barberId === barber.id} onClick={() => chooseBarber(barber.id)} disabled={!bookingEnabled} className={`booking-kapster-card ${barberId === barber.id ? 'is-selected' : ''}`}>
          <span className="booking-kapster-photo">
            {barber.portrait_url
              ? <Image src={barber.portrait_url} alt="" fill sizes="(max-width: 640px) 45vw, 210px" unoptimized={!barber.portrait_url.startsWith('/')} className="object-cover grayscale" />
              : <span className="booking-kapster-placeholder"><UserRound size={30} /></span>}
            <span className="booking-selection-mark" aria-hidden="true">{barberId === barber.id && <Check size={13} />}</span>
          </span>
          <span className="booking-kapster-name">{barber.name}</span>
          <span className="booking-kapster-meta">{barber.specialties.length ? barber.specialties.slice(0, 2).join(' · ') : 'Kapster Terasbarber'}</span>
        </button>)}
      </div> : <p className="booking-inline-message">Belum ada kapster yang bisa dibooking saat ini. Silakan hubungi shop.</p>}
      <StickyBar
        summary={compactSummary[0]}
        summaryLabel="Kapster"
        hint="Jadwal dan layanan menyesuaikan kapster."
        actionLabel="Pilih kapster"
        disabled={!bookingEnabled || !selectedBarber}
        onAction={() => goToStep(2)}
      />
    </section>}

    {step === 2 && <section aria-labelledby="booking-step-schedule">
      <StepHeading number="02" id="booking-step-schedule" title="Pilih Jadwal" description={`Kapster: ${selectedBarber?.name ?? '-'} · pilih tanggal lalu jam yang tersedia.`} />
      <div className="booking-date-layout">
        <div className="booking-calendar">
          <div className="booking-calendar-header"><button type="button" aria-label="Bulan sebelumnya" disabled={month <= startOfCalendarMonth(today)} onClick={() => moveMonth(-1)}><ChevronLeft size={17} /></button><h3>{calendarMonthLabel(month)}</h3><button type="button" aria-label="Bulan berikutnya" disabled={month >= startOfCalendarMonth(maxDate)} onClick={() => moveMonth(1)}><ChevronRight size={17} /></button></div>
          <div className="booking-calendar-grid booking-weekdays" aria-hidden="true">{weekdays.map((day, index) => <span key={index}>{day}</span>)}</div>
          <div className="booking-calendar-grid" role="group" aria-label="Tanggal tersedia">
            {monthDates.cells.map((day, index) => day ? <button key={day} type="button" aria-label={calendarDateLabel(day)} aria-pressed={date === day} disabled={calendarState !== 'ready' || day < today || day > maxDate || !calendarMap.get(day)} onClick={() => chooseDate(day)} className={date === day ? 'is-selected' : ''}>{Number(day.slice(-2))}</button> : <span key={`empty-${index}`} />)}
          </div>
          <div className="booking-calendar-footer"><span><i />Tanggal dengan jadwal tersedia</span>{calendarState === 'loading' && <span><LoaderCircle className="animate-spin" size={12} /> Memuat</span>}</div>
          {calendarError && <p role="alert" className="booking-inline-message">{calendarError}</p>}
        </div>
        <div className="booking-times">
          <div className="booking-calendar-header"><h3>{date ? calendarDateLabel(date) : 'Pilih tanggal'}</h3></div>
          {!date ? <div className="booking-times-placeholder"><CalendarDays size={20} /><span>Pilih tanggal dulu untuk melihat jam tersedia.</span></div>
            : scheduleState === 'loading' ? <div className="booking-times-placeholder"><LoaderCircle className="animate-spin" size={20} /><span>Memuat jam tersedia…</span></div>
              : scheduleState === 'error' ? <div className="booking-times-placeholder"><span>{scheduleError}</span><button type="button" className="booking-text-link" onClick={() => setRefresh(value => value + 1)}>Coba lagi</button></div>
                : schedule.filter(slot => slot.is_available).length === 0 ? <div className="booking-times-placeholder"><Clock3 size={20} /><span>Belum ada jam tersedia di tanggal ini. Pilih tanggal lain.</span></div>
                  : <>
                    <div className="booking-time-grid" role="group" aria-label="Jam tersedia">
                      {schedule.filter(slot => slot.is_available).map(slot => <button key={slot.starts_at} type="button" aria-pressed={selectedTime === slot.starts_at} onClick={() => { setSelectedTime(slot.starts_at); setError(''); }} className={selectedTime === slot.starts_at ? 'is-selected' : ''}>{timeLabel(slot.starts_at, timezone)}</button>)}
                    </div>
                    <p className="booking-times-hint"><Clock3 size={12} /> Jam dalam zona waktu {timezone}</p>
                  </>}
        </div>
      </div>
      <StickyBar
        summary={selectedTime && date ? `${calendarDateLabel(date)} · ${timeLabel(selectedTime, timezone)}` : (date ? 'Pilih jam' : 'Belum dipilih')}
        summaryLabel="Jadwal"
        back={() => goToStep(1)}
        actionLabel="Pilih jadwal"
        disabled={!bookingEnabled || !selectedSlot}
        onAction={() => goToStep(3)}
      />
    </section>}

    {step === 3 && <section aria-labelledby="booking-step-service">
      <StepHeading number="03" id="booking-step-service" title="Pilih Layanan" description="Pilih satu atau beberapa layanan. Kami menyiapkan waktu untuk semuanya." />
      {eligibleServices.length ? <div className="booking-service-grid" role="group" aria-label="Pilih layanan">
        {eligibleServices.map((service, index) => {
          const categoryIndex = eligibleServices.slice(0, index).filter(item => item.category === service.category).length;
          const image = serviceImage(service, categoryIndex);
          const selected = serviceIds.includes(service.id);
          const fits = slotFits(selectedSlot, selectedServices.reduce((sum, item) => sum + item.duration_minutes, 0) + (selected ? 0 : service.duration_minutes));
          return <button key={service.id} type="button" disabled={!bookingEnabled} aria-pressed={selected} onClick={() => toggleService(service.id)} className={`booking-service-card ${selected ? 'is-selected' : ''}`}>
            <span className="booking-service-image image-frame"><Image src={image} alt="" fill sizes="(max-width: 640px) 110px, 320px" unoptimized={!image.startsWith('/')} className="object-cover grayscale" />{serviceImageIsIllustrative(service) && <span className="booking-image-caption">Ilustrasi</span>}</span>
            <span className="booking-service-info"><span className="booking-card-top"><span className="label text-neutral-500">{categoryNames[service.category]}</span><span className="booking-selection-mark" aria-hidden="true">{selected && <Check size={13} />}</span></span>
              <span className="booking-service-name">{service.name}</span>
              {service.description && <span className="booking-service-description">{service.description}</span>}
              <span className="booking-service-meta"><strong>{idr(service.price_idr)}</strong><span><Clock3 size={12} /> {service.duration_minutes} menit</span></span>
              {!fits && !selected && <span className="booking-service-warning">Durasi melebihi sisa waktu di jadwal ini</span>}
            </span>
          </button>;
        })}
      </div> : <div className="booking-empty-service">
        <div className="booking-empty-image"><Image src="/images/service-haircut-detail.jpg" alt="" fill sizes="(max-width: 640px) 100vw, 320px" loading="eager" className="object-cover grayscale" /></div>
        <div><Scissors size={20} /><p className="label mt-4 text-neutral-500">Menu / segera hadir</p><h3 className="display mt-2">LAYANAN<br />SEGERA HADIR.</h3><p className="mt-3 text-sm leading-6 text-neutral-600">Belum ada layanan untuk kapster ini. Coba pilih kapster lain.</p><button type="button" className="booking-text-link mt-4" onClick={() => goToStep(1)}>Ganti kapster <ArrowUpRight size={13} /></button></div>
      </div>}
      {selectedServices.length > 0 && <div className="booking-selection-total"><span>{selectedServices.length} layanan dipilih <span>· {totalDuration} menit</span></span><strong>{idr(totalPrice)}</strong></div>}
      <StickyBar
        summary={selectedServices.length ? `${selectedServices.length} layanan · ${idr(totalPrice)}` : 'Belum dipilih'}
        summaryLabel="Layanan"
        back={() => goToStep(2)}
        actionLabel="Lanjut ke checkout"
        disabled={!bookingEnabled || !selectedServices.length}
        onAction={continueToCheckout}
      />
    </section>}

    {step === 4 && selectedServices.length > 0 && <section aria-labelledby="booking-step-checkout">
      <StepHeading number="04" id="booking-step-checkout" title="Checkout" description="Lengkapi data Anda, pilih metode pembayaran, lalu konfirmasi booking." />
      <div className="booking-review-services"><p className="label text-neutral-500">Layanan Anda</p>{selectedServices.map(service => <div key={service.id}><span><strong>{service.name}</strong><small>{service.duration_minutes} menit</small></span><strong>{idr(service.price_idr)}</strong></div>)}</div>
      <div className="booking-fields">
        <label><span className="label mb-2 block">Nama lengkap</span><input className="form-field" value={customerName} onChange={event => setCustomerName(event.target.value)} maxLength={80} autoComplete="name" aria-invalid={Boolean(fieldErrors.name)} placeholder="Nama Anda" />{fieldErrors.name && <span className="booking-field-error">{fieldErrors.name}</span>}</label>
        <label><span className="label mb-2 block">Nomor WhatsApp</span><input className="form-field" value={customerPhone} onChange={event => setCustomerPhone(event.target.value)} inputMode="tel" autoComplete="tel" aria-invalid={Boolean(fieldErrors.phone)} placeholder="0812 3456 7890" />{fieldErrors.phone && <span className="booking-field-error">{fieldErrors.phone}</span>}</label>
      </div>
      <label className="mt-4 block"><span className="label mb-2 block">Catatan (opsional)</span><textarea className="form-field" rows={3} value={notes} maxLength={500} onChange={event => setNotes(event.target.value)} placeholder="Contoh: model faded, jangan terlalu pendek" /></label>

      <fieldset className="booking-payment-methods">
        <legend className="label">Metode pembayaran</legend>
        <label className={`booking-payment-option ${paymentMethod === 'qris' ? 'is-selected' : ''}`}>
          <input type="radio" name="paymentMethod" value="qris" checked={paymentMethod === 'qris'} onChange={() => setPaymentMethod('qris')} />
          <span className="booking-payment-option-icon"><QrCode size={19} /></span>
          <span className="booking-payment-option-copy"><strong>QRIS</strong><span>Bayar sekarang lewat e-wallet atau mobile banking. Booking langsung dikonfirmasi setelah pembayaran masuk.</span></span>
        </label>
        <label className={`booking-payment-option ${paymentMethod === 'pay_at_barber' ? 'is-selected' : ''}`}>
          <input type="radio" name="paymentMethod" value="pay_at_barber" checked={paymentMethod === 'pay_at_barber'} onChange={() => setPaymentMethod('pay_at_barber')} />
          <span className="booking-payment-option-icon"><Store size={19} /></span>
          <span className="booking-payment-option-copy"><strong>Bayar di Barbershop</strong><span>Bayar tunai atau QRIS di kasir saat datang. Slot ditahan 30 menit sampai shop mengonfirmasi.</span></span>
        </label>
      </fieldset>

      <dl className="booking-review-details">
        <Summary label="Kapster" value={selectedBarber?.name ?? '-'} />
        <Summary label="Jadwal" value={date && selectedTime ? `${dateTimeLabel(selectedTime, timezone)} · ${timeLabel(selectedTime, timezone)}` : '-'} detail={timezone} />
        <Summary label="Durasi" value={`${totalDuration} menit`} />
        <Summary label="Total" value={idr(totalPrice)} detail={paymentMethod === 'qris' ? 'Dibayar sekarang via QRIS' : 'Dibayar di barbershop'} strong />
      </dl>
      <label className="booking-consent"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} /><span>Saya setuju data ini disimpan untuk keperluan janji temu dan dihubungi lewat WhatsApp.</span></label>
      {fieldErrors.consent && <span className="booking-field-error">{fieldErrors.consent}</span>}
      <p className="booking-policy"><ShieldCheck size={17} /><span>{paymentMethod === 'qris' ? 'Pembayaran diproses aman oleh Midtrans. Jadwal otomatis dikonfirmasi setelah pembayaran QRIS berhasil.' : 'Booking ini belum lunas. Datang beberapa menit lebih awal dan bayar langsung di kasir.'}</span></p>
      <div className="booking-actions">
        <button type="button" className="btn-outline" disabled={submitting} onClick={() => goToStep(3)}><ArrowLeft size={14} /> Kembali</button>
        <button type="submit" className="btn-primary" disabled={submitting || !bookingEnabled}>{submitting ? <>Memproses booking <LoaderCircle className="animate-spin" size={15} /></> : <>{paymentMethod === 'qris' ? <>Bayar dengan QRIS <QrCode size={15} /></> : <>Konfirmasi booking <CreditCard size={15} /></>}</>}</button>
      </div>
    </section>}
  </form>;
}

function StepHeading({ number, id, title, description }: { number: string; id: string; title: string; description: string }) {
  return <div className="booking-step-heading"><p className="label text-neutral-500">{number} / {steps[Number(number) - 1].short}</p><h2 id={id} className="display">{title}<span className="text-lime">.</span></h2><p>{description}</p></div>;
}
function StickyBar({ summary, summaryLabel, hint, back, actionLabel, disabled = false, onAction }: {
  summary: string; summaryLabel: string; hint?: string; back?: () => void; actionLabel: string; disabled?: boolean; onAction: () => void;
}) {
  return <div className="booking-sticky-bar">
    <div className="booking-sticky-summary">
      <span className="label">{summaryLabel}</span>
      <strong>{summary}</strong>
      {hint && <small>{hint}</small>}
    </div>
    <div className="booking-sticky-actions">
      {back && <button type="button" className="btn-outline" onClick={back}><ArrowLeft size={14} /> Kembali</button>}
      <button type="button" className="btn-primary" disabled={disabled} onClick={onAction}>{actionLabel} <ArrowRight size={15} /></button>
    </div>
  </div>;
}
function Summary({ label, value, detail, strong = false }: { label: string; value: string; detail?: string; strong?: boolean }) {
  return <div className="booking-summary-row"><dt>{label}</dt><dd className={strong ? 'is-strong' : ''}>{value}{detail && <small>{detail}</small>}</dd></div>;
}
