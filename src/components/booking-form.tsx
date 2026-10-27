'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, ArrowUpRight, CalendarDays, Check, Clock3, LoaderCircle } from 'lucide-react';
import { serviceImage, serviceImageIsIllustrative, type ServiceCategory } from '@/lib/service-visual';
import { bookingSlotKey, type BookingSlot } from '@/lib/booking-slots';

type ServiceOption = { id: string; name: string; description: string; category: ServiceCategory; image_url: string | null; price_idr: number; duration_minutes: number };
type BarberOption = { id: string; name: string; serviceIds: string[]; bio: string; specialties: string[] };
type Completed = { code: string; service: string; barber: string; startsAt: string; manageUrl: string };
const copy = {
  steps: ['Service', 'Time', 'Your details', 'Review'],
  unavailable: 'Online booking is not active yet. The database, shop schedule, and server configuration must be set up first.',
  appointment: 'Book an appointment', step: 'STEP', service: 'Choose a service', serviceUnavailable: 'No services are available yet. Please contact the shop.', minutes: 'min',
  networkError: 'Connection problem. Check your internet connection and try again.',
  nextBarber: 'Choose barber & time', chooseService: 'Choose a service first.', chooseSlot: 'Choose an available date and time.',
  nameRequired: 'Enter your full name (at least 2 characters).', phoneInvalid: 'Enter a valid WhatsApp number, including a country code if available.',
  consentRequired: 'Agree to the privacy and booking policy to continue.', incomplete: 'Complete the booking steps before submitting.', saveFailed: 'Your booking could not be saved. Please try again.',
  timeStep: 'Choose barber & time', editService: 'Change service', barber: 'Barber', noPreference: 'No preference', anyBarber: 'We will assign an eligible barber with an available slot.',
  noBarberForService: 'No active barber is currently assigned to this service.', date: 'Date', availableTimes: 'Available times', checking: 'Checking availability…',
  noTimes: 'No times are available on this date. Try another date or barber.', timezone: 'Times shown in', durationAuto: 'Service duration is included automatically.', back: 'Back',
  nextDetails: 'Continue to your details', details: 'Customer details', fullName: 'Full name', yourName: 'Your name', whatsapp: 'WhatsApp number',
  barberNotes: 'Note for the barber', optional: 'optional', notesPlaceholder: 'Cut preferences or anything else we should know', consent: 'I agree that these details may be used to manage this appointment. Read the', privacy: 'privacy notice',
  pendingNote: 'Your request will remain pending until the shop confirms it. The shop may contact you on WhatsApp.', review: 'Review booking', checkBooking: 'Review your booking',
  serviceLabel: 'Service', barberLabel: 'Barber', dateTime: 'Date & time', nameLabel: 'Name', whatsappLabel: 'WhatsApp', notesLabel: 'Notes', price: 'Price',
  reviewPolicy: 'By submitting, you request this appointment and agree that the shop may contact you. The booking is not confirmed until the shop confirms it. The slot is reserved once your request is saved.',
  editDetails: 'Edit details', saving: 'Saving booking…', confirm: 'Confirm booking',
  saved: 'Request saved', successTitle: <>ONE STEP<br />CLOSER.</>, savedPrefix: 'Your request for', with: 'with', on: 'on', at: 'at', savedAs: 'has been saved as', pending: 'pending', fromShop: 'until the shop confirms it.',
  message: 'Message', via: 'on WhatsApp', noWhatsapp: 'No WhatsApp contact is configured yet. Your booking is saved; keep the booking code and wait for the shop to contact you.',
  manage: 'View / manage booking', bookingCode: 'Booking code', bookAgain: 'Book another appointment', photoIllustration: 'Photo illustration',
  barberAvailable: 'Available barber', availableForService: 'Available for this service.'
} as const;

function timeLabel(value: string, timezone: string) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(value));
}
function dateAtTimezone(date: string, timezone: string) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: timezone, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(date));
}
function categoryLabel(category: ServiceCategory) {
  const english: Record<ServiceCategory, string> = { HAIRCUT: 'Haircut', COMBO: 'Combo', BEARD: 'Beard' };
  return english[category];
}
function formatPrice(amount: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(amount);
}
function localizedApiError(message: string) {
  const known = [
    'That slot was just taken. Pick another time.',
    'Too many booking attempts. Please wait a few minutes and try again.',
    'That service is no longer available.',
    'That time is outside the booking window.',
    'The shop schedule is not configured yet.',
    'Availability could not be loaded. Please try again.',
    'Choose a service and valid date.',
    'Booking is not configured yet.',
    'Online booking is not configured yet.',
    'Bookings are not fully configured. Please contact the shop.',
    'Invalid request body.',
    'Check the booking details and try again.',
    'We could not save this booking. Please try again.'
  ];
  return known.find(error => message.includes(error)) || copy.networkError;
}

export function BookingForm({ services, barbers, timezone, today, horizonDays, configured, initialServiceId = '', initialBarberId = '' }: {
  services: ServiceOption[]; barbers: BarberOption[]; timezone: string; today: string; horizonDays: number; configured: boolean; initialServiceId?: string; initialBarberId?: string;
}) {
  const t = copy;
  const steps = t.steps;
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
  function showError(message: string) {
    setError(message);
  }

  useEffect(() => {
    if (!configured || !serviceId || !date) return;
    const controller = new AbortController();
    const query = new URLSearchParams({ date, serviceId });
    if (barberFilter) query.set('barberId', barberFilter);
    fetch(`/api/availability?${query}`, { signal: controller.signal, cache: 'no-store' })
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(localizedApiError(body.error || 'Availability could not be loaded. Please try again.'));
        return body.slots as BookingSlot[];
      })
      .then(data => { setSlots(data); setSlotValue(''); setError(''); })
      .catch(reason => { if (reason.name !== 'AbortError') { setSlots([]); setError(localizedApiError(reason.message)); } })
      .finally(() => { if (!controller.signal.aborted) setLoadingSlots(false); });
    return () => controller.abort();
  }, [configured, serviceId, barberFilter, date]);

  const selectedSlot = slots.find(slot => bookingSlotKey(slot) === slotValue);
  const selectedService = services.find(service => service.id === serviceId);
  const selectedBarber = selectedSlot?.barber_name || (barberFilter ? barbers.find(barber => barber.id === barberFilter)?.name : null) || t.barberAvailable;
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
    if (!selectedService) { showError(t.chooseService); return; }
    goToStep(2);
  }
  function continueToDetails() {
    if (!selectedSlot) { showError(t.chooseSlot); return; }
    goToStep(3);
  }
  function continueToReview() {
    if (customerName.trim().length < 2) { showError(t.nameRequired); return; }
    if (!/^\+?[0-9][0-9\s()-]{7,19}$/.test(customerPhone.trim())) { showError(t.phoneInvalid); return; }
    if (!consent) { showError(t.consentRequired); return; }
    goToStep(4);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (step !== 4 || !selectedService || !selectedSlot) { showError(t.incomplete); return; }
    if (!consent) { showError(t.consentRequired); setStep(3); return; }
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
      if (!response.ok) throw new Error(body.error || 'We could not save this booking. Please try again.');
      setCompleted({ ...body.booking, manageUrl: body.manageUrl });
      setWhatsappUrl(body.whatsappUrl);
      setWhatsappRecipient(body.whatsappRecipient === 'barber' ? 'barber' : 'shop');
    } catch (reason) {
      showError(reason instanceof Error ? localizedApiError(reason.message) : t.saveFailed);
      if (reason instanceof Error && /taken/i.test(reason.message)) { setSlotValue(''); setStep(2); }
    } finally { setSubmitting(false); }
  }

  if (completed) return <section aria-live="polite" className="border border-ink bg-lime p-6 sm:p-9">
    <div className="mb-5 grid size-10 place-items-center border border-ink"><Check size={20} /></div>
    <p className="label mb-3">{t.saved} · {completed.code}</p>
    <h2 className="display text-4xl sm:text-6xl">{t.successTitle}</h2>
    <p className="mt-4 max-w-lg text-sm leading-6">{t.savedPrefix} {completed.service} {t.with} {completed.barber} {t.on} {dateAtTimezone(completed.startsAt, timezone)} {t.at} {timeLabel(completed.startsAt, timezone)} {t.savedAs} <strong>{t.pending}</strong> {t.fromShop}</p>
    {whatsappUrl ? <a className="btn-dark mt-7" href={whatsappUrl} target="_blank" rel="noreferrer">{t.message} {whatsappRecipient === 'barber' ? completed.barber : 'the shop'} {t.via} <ArrowUpRight size={15} /></a> : <p className="mt-6 border-t border-black/20 pt-4 text-xs">{t.noWhatsapp}</p>}
    <Link href={completed.manageUrl} className="btn-outline mt-4 w-full sm:w-auto">{t.manage} <ArrowUpRight size={14} /></Link>
    <p className="mt-5 text-[10px] font-semibold uppercase tracking-[.12em]">{t.bookingCode}: {completed.code}</p>
    <button type="button" className="label mt-7 flex items-center gap-2 underline underline-offset-4" onClick={() => { setCompleted(null); setWhatsappUrl(null); setStep(1); setServiceId(''); setSlotValue(''); }}>{t.bookAgain} <ArrowLeft size={13} /></button>
  </section>;

  return <form onSubmit={submit} className="border border-black/20 bg-cream p-5 sm:p-8">
    {!configured && <div role="status" className="mb-6 border-l-4 border-lime bg-white p-4 text-sm">{t.unavailable}</div>}
    <div className="mb-7 border-b border-black/20 pb-5">
      <div className="mb-4 flex items-center justify-between gap-4"><span className="label">{t.appointment}</span><span className="label text-neutral-500">{t.step} {step} / 4</span></div>
      <ol className="booking-progress" aria-label="Booking progress">
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
      <h2 id="booking-step-service" className="label mb-4">01 / {t.service}</h2>
      {services.length ? <div className="booking-service-grid grid gap-3 sm:grid-cols-2 xl:grid-cols-3" role="group" aria-label={t.service}>
        {services.map(service => {
          const image = serviceImage(service);
          const illustrative = serviceImageIsIllustrative(service);
          const selected = serviceId === service.id;
          return <button key={service.id} type="button" disabled={!configured} aria-pressed={selected} onClick={() => chooseService(service.id)} className={`booking-service-card text-left ${selected ? 'is-selected' : ''}`}>
            <div className="booking-service-image image-frame relative aspect-[4/3] bg-[#d8d4cc]"><Image src={image} alt={illustrative ? `Illustrative ${categoryLabel(service.category).toLowerCase()} service` : `${service.name} service`} fill sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw" unoptimized className="object-cover grayscale transition-transform duration-500" />{illustrative && <span className="absolute bottom-2 left-2 bg-ink/85 px-2 py-1 text-[8px] font-bold uppercase tracking-[.12em] text-white">{t.photoIllustration}</span>}</div>
            <span className="booking-service-info block p-3 sm:p-4"><span className="flex items-center justify-between gap-2"><span className="label text-neutral-500">{categoryLabel(service.category)} / {service.duration_minutes} {t.minutes}</span><span className="text-xs font-bold">{formatPrice(service.price_idr)}</span></span><span className="display mt-3 block text-2xl">{service.name}</span>{service.description && <span className="mt-2 block line-clamp-2 text-xs leading-5 text-neutral-600">{service.description}</span>}</span>
          </button>;
        })}
      </div> : <p className="border border-black/15 px-4 py-5 text-sm text-neutral-600">{t.serviceUnavailable}</p>}
      <div className="mt-6 flex justify-end"><button type="button" className="btn-primary w-full justify-center sm:w-auto" disabled={!configured || !selectedService} onClick={continueToTime}>{t.nextBarber} <ArrowRight size={15} /></button></div>
    </section>}

    {step === 2 && <section aria-labelledby="booking-step-time">
      <div className="mb-5 flex items-center justify-between gap-4"><h2 id="booking-step-time" className="label">02 / {t.timeStep}</h2><button type="button" className="label inline-flex items-center gap-1 text-neutral-500 underline" onClick={() => goToStep(1)}><ArrowLeft size={12} /> {t.editService}</button></div>
      {selectedService && <p className="mb-4 border-l-2 border-lime pl-3 text-xs text-neutral-600">{selectedService.name} · {selectedService.duration_minutes} {t.minutes} · {formatPrice(selectedService.price_idr)}</p>}
      <p className="label mb-2">{t.barber}</p>
      <div className="mb-5 grid gap-2 sm:grid-cols-2">
        <button type="button" disabled={!configured || !selectedService} aria-pressed={!barberFilter} onClick={() => { setBarberFilter(''); setSlots([]); setSlotValue(''); setError(''); setLoadingSlots(Boolean(configured && serviceId)); }} className={`border p-3 text-left transition-colors ${!barberFilter ? 'border-ink bg-ink text-cream' : 'border-black/20 hover:border-black'}`}>
          <span className="label block">{t.noPreference}</span><span className={`mt-1 block text-xs ${!barberFilter ? 'text-white/70' : 'text-neutral-500'}`}>{t.anyBarber}</span>
        </button>
        {eligibleBarbers.map(barber => <button key={barber.id} type="button" disabled={!configured} aria-pressed={barberFilter === barber.id} onClick={() => { setBarberFilter(barber.id); setSlots([]); setSlotValue(''); setError(''); setLoadingSlots(Boolean(configured && serviceId)); }} className={`border p-3 text-left transition-colors ${barberFilter === barber.id ? 'border-ink bg-ink text-cream' : 'border-black/20 hover:border-black'}`}>
          <span className="label block">{barber.name}</span><span className={`mt-1 block line-clamp-2 text-xs ${barberFilter === barber.id ? 'text-white/70' : 'text-neutral-500'}`}>{barber.specialties.length ? barber.specialties.join(' · ') : barber.bio || t.availableForService}</span>
        </button>)}
        {selectedService && eligibleBarbers.length === 0 && <p className="border border-black/15 p-3 text-xs text-neutral-600">{t.noBarberForService}</p>}
      </div>
      <label className="mb-5 block"><span className="label mb-2 flex items-center gap-2"><CalendarDays size={13} />{t.date}</span><input className="form-field" type="date" min={today} max={maxDate} value={date} onChange={event => { setDate(event.target.value); setSlots([]); setSlotValue(''); setError(''); setLoadingSlots(Boolean(configured && serviceId && event.target.value)); }} required disabled={!configured || !serviceId} /></label>
      <div>
        <p className="label mb-2 flex items-center justify-between">{t.availableTimes} {loadingSlots && <LoaderCircle className="animate-spin" size={15} />}</p>
        {loadingSlots ? <p className="border border-black/15 px-4 py-5 text-sm text-neutral-500">{t.checking}</p> : slots.length ? <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{slots.map(slot => {
          const key = bookingSlotKey(slot);
          const active = key === slotValue;
          return <button key={key} type="button" aria-pressed={active} onClick={() => { setSlotValue(key); setError(''); }} className={`border px-3 py-3 text-left transition-colors ${active ? 'border-ink bg-lime' : 'border-black/20 bg-white/40 hover:border-black'}`}>
            <span className="display block text-xl">{timeLabel(slot.starts_at, timezone)}</span><span className="mt-1 block text-[10px] text-neutral-500">{slot.barber_name}</span>
          </button>;
        })}</div> : <p className="border border-black/15 px-4 py-5 text-sm text-neutral-600">{t.noTimes}</p>}
        <p className="mt-2 flex items-center gap-1 text-[10px] text-neutral-500"><Clock3 size={11} /> {t.timezone} {timezone}. {t.durationAuto}</p>
      </div>
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between"><button type="button" className="btn-outline w-full justify-center sm:w-auto" onClick={() => goToStep(1)}><ArrowLeft size={14} />{t.back}</button><button type="button" className="btn-primary w-full justify-center sm:w-auto" disabled={!selectedSlot} onClick={continueToDetails}>{t.nextDetails} <ArrowRight size={15} /></button></div>
    </section>}

    {step === 3 && <section aria-labelledby="booking-step-details">
      <h2 id="booking-step-details" className="label mb-5">03 / {t.details}</h2>
      <div className="mb-5 border border-black/15 bg-white/40 p-4 text-xs leading-5 text-neutral-600"><strong className="text-ink">{selectedService?.name}</strong> {t.with} <strong className="text-ink">{selectedBarber}</strong><br />{selectedSlot && `${dateAtTimezone(selectedSlot.starts_at, timezone)} · ${timeLabel(selectedSlot.starts_at, timezone)}`}</div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label><span className="label mb-2 block">{t.fullName}</span><input className="form-field" name="customerName" type="text" minLength={2} maxLength={80} autoComplete="name" placeholder={t.yourName} value={customerName} onChange={event => setCustomerName(event.target.value)} required disabled={!configured} /></label>
        <label><span className="label mb-2 block">{t.whatsapp}</span><input className="form-field" name="customerPhone" type="tel" minLength={8} maxLength={24} autoComplete="tel" placeholder="+62…" value={customerPhone} onChange={event => setCustomerPhone(event.target.value)} required disabled={!configured} /></label>
        <label className="sm:col-span-2"><span className="label mb-2 block">{t.barberNotes} <span className="font-normal normal-case tracking-normal">({t.optional})</span></span><textarea className="form-field min-h-24 resize-y" name="notes" maxLength={500} placeholder={t.notesPlaceholder} value={notes} onChange={event => setNotes(event.target.value)} disabled={!configured} /></label>
      </div>
      <label className="mt-5 flex items-start gap-3 text-xs leading-5 text-neutral-600"><input className="mt-1 accent-black" type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} disabled={!configured} /><span>{t.consent} <Link href="/privacy" className="underline">{t.privacy}</Link>.</span></label>
      <p className="mt-4 text-[10px] leading-5 text-neutral-500">{t.pendingNote}</p>
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between"><button type="button" className="btn-outline w-full justify-center sm:w-auto" onClick={() => goToStep(2)}><ArrowLeft size={14} />{t.back}</button><button type="button" className="btn-primary w-full justify-center sm:w-auto" disabled={!configured} onClick={continueToReview}>{t.review} <ArrowRight size={15} /></button></div>
    </section>}

    {step === 4 && selectedService && selectedSlot && <section aria-labelledby="booking-step-review">
      <h2 id="booking-step-review" className="label mb-5">04 / {t.checkBooking}</h2>
      <dl className="border-y border-black/20">
        <Summary label={t.serviceLabel} value={selectedService.name} detail={`${selectedService.duration_minutes} ${t.minutes}`} />
        <Summary label={t.barberLabel} value={selectedSlot.barber_name} />
        <Summary label={t.dateTime} value={`${dateAtTimezone(selectedSlot.starts_at, timezone)} · ${timeLabel(selectedSlot.starts_at, timezone)}`} />
        <Summary label={t.nameLabel} value={customerName.trim()} />
        <Summary label={t.whatsappLabel} value={customerPhone.trim()} />
        {notes.trim() && <Summary label={t.notesLabel} value={notes.trim()} />}
        <Summary label={t.price} value={formatPrice(selectedService.price_idr)} strong />
      </dl>
      <p className="mt-4 text-xs leading-5 text-neutral-600">{t.reviewPolicy}</p>
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between"><button type="button" className="btn-outline w-full justify-center sm:w-auto" disabled={submitting} onClick={() => goToStep(3)}><ArrowLeft size={14} /> {t.editDetails}</button><button type="submit" className="btn-primary w-full justify-center disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto" disabled={!configured || submitting}>{submitting ? <>{t.saving} <LoaderCircle className="animate-spin" size={15} /></> : <>{t.confirm} <ArrowUpRight size={15} /></>}</button></div>
    </section>}
  </form>;
}

function Summary({ label, value, detail, strong = false }: { label: string; value: string; detail?: string; strong?: boolean }) {
  return <div className="flex items-start justify-between gap-4 border-b border-black/10 py-3 last:border-b-0"><dt className="label shrink-0 text-neutral-500">{label}</dt><dd className={`max-w-[70%] text-right text-sm ${strong ? 'font-bold' : ''}`}>{value}{detail && <span className="mt-1 block text-xs font-normal text-neutral-500">{detail}</span>}</dd></div>;
}
