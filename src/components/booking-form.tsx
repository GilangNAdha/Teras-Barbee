'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowLeft, ArrowRight, ArrowUpRight, CalendarDays, Check, ChevronLeft, ChevronRight,
  Clock3, LoaderCircle, Scissors, ShieldCheck, UserRound, UsersRound
} from 'lucide-react';
import { addCalendarDays, calendarDateLabel, calendarMonthDates, calendarMonthLabel, shiftCalendarMonth, startOfCalendarMonth } from '@/lib/booking-calendar';
import type { BookingBarber, BookingService } from '@/lib/booking-options';
import { groupBookingSlots, type BookingSlotAvailability } from '@/lib/booking-slots';
import { idr } from '@/lib/format';
import { serviceImage, serviceImageIsIllustrative, type ServiceCategory } from '@/lib/service-visual';
import { isValidWhatsapp } from '@/lib/validation/booking';

type Completed = { code: string; service: string; barber: string; startsAt: string; price: number; duration: number; status: 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'no_show'; manageUrl: string };
type DateAvailability = { booking_date: string; is_available: boolean };
type FetchState = 'idle' | 'loading' | 'ready' | 'error';
type FieldErrors = { name?: string; phone?: string; consent?: string };

const steps = [
  { short: 'Service', title: 'Choose your service' },
  { short: 'Barber', title: 'Choose your barber' },
  { short: 'Time', title: 'Choose date & time' },
  { short: 'Details', title: 'Your details' },
  { short: 'Review', title: 'Review your booking' }
] as const;
const weekdays = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const categoryNames: Record<ServiceCategory, string> = { HAIRCUT: 'Haircut', COMBO: 'Combo', BEARD: 'Beard' };

function timeLabel(value: string, timezone: string) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(value));
}
function dateTimeLabel(value: string, timezone: string) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: timezone, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(value));
}
function apiMessage(reason: unknown, fallback: string) {
  return reason instanceof Error && reason.message ? reason.message : fallback;
}
async function readResponse(response: Response) {
  const body = await response.json();
  if (!response.ok) throw new Error(typeof body.error === 'string' ? body.error : 'Something went wrong. Please try again.');
  return body;
}

export function BookingForm({ services, barbers, timezone, today, horizonDays, configured, initialServiceId = '', initialBarberId = '', loadError = false }: {
  services: BookingService[]; barbers: BookingBarber[]; timezone: string; today: string; horizonDays: number; configured: boolean; initialServiceId?: string; initialBarberId?: string; loadError?: boolean;
}) {
  const [step, setStep] = useState(initialServiceId ? 2 : 1);
  const [hydrated, setHydrated] = useState(false);
  const [serviceIds, setServiceIds] = useState<string[]>(initialServiceId ? [initialServiceId] : []);
  const [barberId, setBarberId] = useState(initialBarberId);
  const [month, setMonth] = useState(startOfCalendarMonth(today));
  const [date, setDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [slots, setSlots] = useState<BookingSlotAvailability[]>([]);
  const [slotState, setSlotState] = useState<FetchState>('idle');
  const [slotError, setSlotError] = useState('');
  const [calendar, setCalendar] = useState<DateAvailability[]>([]);
  const [calendarState, setCalendarState] = useState<FetchState>('idle');
  const [calendarError, setCalendarError] = useState('');
  const [todaySlots, setTodaySlots] = useState<BookingSlotAvailability[]>([]);
  const [barberState, setBarberState] = useState<FetchState>('idle');
  const [refresh, setRefresh] = useState(0);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [consent, setConsent] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState<Completed | null>(null);
  const [whatsappUrl, setWhatsappUrl] = useState<string | null>(null);
  const [whatsappRecipient, setWhatsappRecipient] = useState<'barber' | 'shop'>('shop');
  const submittingRef = useRef(false);
  const requestIdRef = useRef<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const serviceKey = serviceIds.join(',');
  const selectedServices = serviceIds.map(id => services.find(service => service.id === id)).filter((service): service is BookingService => Boolean(service));
  const totalPrice = selectedServices.reduce((sum, service) => sum + service.price_idr, 0);
  const totalDuration = selectedServices.reduce((sum, service) => sum + service.duration_minutes, 0);
  const eligibleBarbers = barbers.filter(barber => serviceIds.length > 0 && serviceIds.every(id => barber.serviceIds.includes(id)));
  const selectedBarber = barberId ? eligibleBarbers.find(barber => barber.id === barberId) : null;
  const maxDate = addCalendarDays(today, horizonDays);
  const monthDates = useMemo(() => calendarMonthDates(month), [month]);
  const calendarMap = useMemo(() => new Map(calendar.map(item => [item.booking_date, item.is_available])), [calendar]);
  const groupedSlots = useMemo(() => groupBookingSlots(slots), [slots]);
  const selectedSlot = groupedSlots.find(slot => slot.starts_at === selectedTime && slot.is_available);
  const bookingEnabled = configured && !loadError && hydrated;

  useEffect(() => {
    // Keep server-rendered controls disabled until their event handlers are ready.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHydrated(true);
  }, []);

  // Show truthful availability for today without implying that a barber with no
  // openings today cannot be booked on a future day.
  useEffect(() => {
    if (!bookingEnabled || !serviceKey || step !== 2) return;
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- This state represents the lifetime of this request.
    setBarberState('loading');
    const query = new URLSearchParams({ date: today, serviceIds: serviceKey, includeUnavailable: '1' });
    fetch(`/api/availability?${query}`, { signal: controller.signal, cache: 'no-store' })
      .then(readResponse)
      .then(body => { setTodaySlots(body.slots as BookingSlotAvailability[]); setBarberState('ready'); })
      .catch(() => { if (!controller.signal.aborted) { setTodaySlots([]); setBarberState('error'); } });
    return () => controller.abort();
  }, [bookingEnabled, serviceKey, step, today]);

  useEffect(() => {
    if (!bookingEnabled || !serviceKey || step !== 3) return;
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Reset the calendar while the selected month is fetched.
    setCalendarState('loading');
    setCalendarError('');
    const query = new URLSearchParams({ view: 'calendar', from: monthDates.first, to: monthDates.last, serviceIds: serviceKey });
    if (barberId) query.set('barberId', barberId);
    fetch(`/api/availability?${query}`, { signal: controller.signal, cache: 'no-store' })
      .then(readResponse)
      .then(body => { setCalendar(body.dates as DateAvailability[]); setCalendarState('ready'); })
      .catch(reason => { if (!controller.signal.aborted) { setCalendar([]); setCalendarState('error'); setCalendarError(apiMessage(reason, 'Availability could not be loaded.')); } });
    return () => controller.abort();
  }, [bookingEnabled, serviceKey, barberId, monthDates.first, monthDates.last, step, refresh]);

  useEffect(() => {
    if (!bookingEnabled || !serviceKey || !date || step !== 3) return;
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Prevent a stale slot from being used while rechecking.
    setSlotState('loading');
    setSlotError('');
    const query = new URLSearchParams({ date, serviceIds: serviceKey, includeUnavailable: '1' });
    if (barberId) query.set('barberId', barberId);
    fetch(`/api/availability?${query}`, { signal: controller.signal, cache: 'no-store' })
      .then(readResponse)
      .then(body => {
        const next = body.slots as BookingSlotAvailability[];
        setSlots(next);
        setSelectedTime(previous => groupBookingSlots(next).some(slot => slot.starts_at === previous && slot.is_available) ? previous : '');
        setSlotState('ready');
      })
      .catch(reason => { if (!controller.signal.aborted) { setSlots([]); setSelectedTime(''); setSlotState('error'); setSlotError(apiMessage(reason, 'Availability could not be loaded.')); } });
    return () => controller.abort();
  }, [bookingEnabled, serviceKey, barberId, date, step, refresh]);

  function resetRequest() { requestIdRef.current = null; }
  function resetTime() { setDate(''); setSelectedTime(''); setSlots([]); setSlotState('idle'); resetRequest(); }
  function goToStep(next: number) {
    if (submittingRef.current) return;
    setError('');
    setStep(Math.max(1, Math.min(5, next)));
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function chooseService(id: string) {
    const next = serviceIds.includes(id) ? serviceIds.filter(item => item !== id) : [...serviceIds, id];
    const duration = services.filter(service => next.includes(service.id)).reduce((sum, service) => sum + service.duration_minutes, 0);
    if (next.length > 5 || duration > 600) { setError('Choose up to five services with a total duration of 10 hours or less.'); return; }
    setServiceIds(next);
    if (barberId && !barbers.find(barber => barber.id === barberId && next.every(item => barber.serviceIds.includes(item)))) setBarberId('');
    resetTime(); setError('');
  }
  function chooseBarber(id: string) {
    if (id === barberId) return;
    setBarberId(id); resetTime(); setError('');
  }
  function moveMonth(direction: number) {
    setMonth(shiftCalendarMonth(month, direction));
    resetTime(); setError('');
  }
  function chooseDate(value: string) {
    setDate(value); setSelectedTime(''); setSlots([]); setSlotState('loading'); setError(''); resetRequest();
  }
  function validateDetails() {
    const next: FieldErrors = {};
    if (customerName.trim().length < 2) next.name = 'Please enter your full name (at least 2 characters).';
    if (!isValidWhatsapp(customerPhone)) next.phone = 'Enter a valid WhatsApp number, for example +62 812 3456 7890.';
    if (!consent) next.consent = 'Please agree to the privacy notice to continue.';
    setFieldErrors(next);
    if (Object.keys(next).length) { setError('Please check the highlighted details below.'); return false; }
    return true;
  }
  function continueToReview() {
    if (!selectedSlot) { setError('Please choose an available time first.'); setStep(3); return; }
    if (validateDetails()) goToStep(5);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current) return;
    if (step !== 5 || !selectedServices.length || !selectedSlot || !bookingEnabled) { setError('Please complete the booking steps first.'); return; }
    if (!validateDetails()) { setStep(4); return; }
    submittingRef.current = true;
    setSubmitting(true); setError('');
    requestIdRef.current ??= crypto.randomUUID();
    try {
      const response = await fetch('/api/bookings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serviceIds, barberId: barberId || null, startsAt: selectedSlot.starts_at,
          customerName: customerName.trim(), customerPhone: customerPhone.trim(), notes: notes.trim(),
          requestId: requestIdRef.current, expectedPrice: totalPrice, expectedDuration: totalDuration })
      });
      const body = await readResponse(response);
      setCompleted({ ...body.booking, manageUrl: body.manageUrl });
      setWhatsappUrl(body.whatsappUrl ?? null);
      setWhatsappRecipient(body.whatsappRecipient === 'barber' ? 'barber' : 'shop');
    } catch (reason) {
      const message = apiMessage(reason, 'We could not save your request. Please try again.');
      if (/slot was just taken/i.test(message)) {
        setSelectedTime(''); setStep(3); setRefresh(value => value + 1);
        setError('That time was just taken. Availability has been refreshed; please choose another time.');
      } else if (reason instanceof TypeError) {
        setError('We could not reach the server. Retry without changing your details; the same request will not be submitted twice.');
      } else setError(message);
    } finally { submittingRef.current = false; setSubmitting(false); }
  }

  if (completed) return <section aria-live="polite" className="booking-success">
    <div className="booking-success-check"><Check size={22} /></div>
    <p className="label mt-6 text-lime">Request received / {completed.code}</p>
    <h2 className="display mt-4">{completed.status === 'confirmed' ? <>YOUR CHAIR<br />IS READY</> : completed.status === 'pending' ? <>YOU’RE ONE STEP<br />CLOSER</> : <>YOUR BOOKING<br />IS {completed.status.replace('_', ' ')}</>}<span className="text-lime">.</span></h2>
    <p className="mt-5 max-w-lg text-sm leading-6 text-white/70">{completed.status === 'pending' ? <>Your request is <strong className="text-white">pending</strong> until the shop confirms it. The slot is held for 30 minutes from the time your request is saved.</> : completed.status === 'confirmed' ? 'The shop has confirmed this appointment.' : 'This request was saved previously and its status has since changed. Open the private management link for details.'}</p>
    <dl className="booking-success-summary">
      <Summary label="Services" value={completed.service} detail={`${completed.duration} min`} />
      <Summary label="Barber" value={completed.barber} />
      <Summary label="Date & time" value={`${dateTimeLabel(completed.startsAt, timezone)} · ${timeLabel(completed.startsAt, timezone)}`} />
      <Summary label="Total" value={idr(completed.price)} strong />
    </dl>
    <div className="mt-7 flex flex-wrap gap-3">
      <Link href={completed.manageUrl} className="btn-primary">Manage booking <ArrowUpRight size={14} /></Link>
      {whatsappUrl && completed.status === 'pending' && <a className="booking-success-link" href={whatsappUrl} target="_blank" rel="noreferrer">Message {whatsappRecipient === 'barber' ? completed.barber : 'the shop'} on WhatsApp <ArrowUpRight size={14} /></a>}
    </div>
    <p className="mt-4 text-xs leading-5 text-white/55">Save your private management link to view, reschedule or cancel your request.{!whatsappUrl && completed.status === 'pending' && ' The shop will contact you on the number provided.'}</p>
    <button type="button" className="label mt-8 inline-flex items-center gap-2 text-white/70 underline underline-offset-4" onClick={() => {
      setCompleted(null); setWhatsappUrl(null); setStep(1); setServiceIds([]); setBarberId(''); resetTime();
      setCustomerName(''); setCustomerPhone(''); setNotes(''); setConsent(false); setFieldErrors({}); setError('');
    }}><ArrowLeft size={13} /> Book another appointment</button>
  </section>;

  return <form ref={formRef} onSubmit={submit} className="booking-glass-panel" aria-busy={!hydrated} noValidate>
    <div className="booking-panel-heading">
      <div><p className="label text-neutral-500">Terasbarber / appointments</p><p className="mt-2 text-sm font-bold">Book an appointment</p></div>
      <span className="booking-step-count">{String(step).padStart(2, '0')} <span>/ 05</span></span>
    </div>
    <ol className="booking-progress" aria-label="Booking progress">
      {steps.map((item, index) => {
        const number = index + 1;
        return <li key={item.short}><button type="button" disabled={number >= step || submitting} onClick={() => goToStep(number)} aria-current={number === step ? 'step' : undefined} className={number === step ? 'is-current' : number < step ? 'is-complete' : ''}>
          <span className="booking-progress-number">{number < step ? <Check size={13} /> : String(number).padStart(2, '0')}</span><span>{item.short}</span>
        </button></li>;
      })}
    </ol>
    {loadError ? <div role="alert" className="booking-notice is-error"><strong>We couldn’t load the booking menu.</strong><span> Please check your connection and try again.</span> <a href="/book" className="underline">Reload the page</a></div> : !configured && <div role="status" className="booking-notice"><strong>Online booking is not available just yet.</strong><span> The shop is still setting up its services and schedule. Please check back soon.</span></div>}
    {error && <div role="alert" className="booking-notice is-error">{error}{/refresh the page/i.test(error) && <> <a href="/book" className="underline">Refresh booking</a></>}</div>}

    {!loadError && step === 1 && <section aria-labelledby="booking-step-service">
      <StepHeading number="01" id="booking-step-service" title="Choose your service" description="Select one or more services. We’ll reserve enough time for all of them." />
      {services.length ? <div className="booking-service-grid" role="group" aria-label="Choose your services">
        {services.map((service, index) => {
          const categoryIndex = services.slice(0, index).filter(item => item.category === service.category).length;
          const image = serviceImage(service, categoryIndex);
          const selected = serviceIds.includes(service.id);
          return <button key={service.id} type="button" disabled={!bookingEnabled} aria-pressed={selected} onClick={() => chooseService(service.id)} className={`booking-service-card ${selected ? 'is-selected' : ''}`}>
            <span className="booking-service-image image-frame"><Image src={image} alt="" fill sizes="(max-width: 640px) 110px, 320px" unoptimized={!image.startsWith('/')} className="object-cover grayscale" />{serviceImageIsIllustrative(service) && <span className="booking-image-caption">Illustrative</span>}</span>
            <span className="booking-service-info"><span className="booking-card-top"><span className="label text-neutral-500">{categoryNames[service.category]}</span><span className="booking-selection-mark" aria-hidden="true">{selected && <Check size={13} />}</span></span>
              <span className="booking-service-name">{service.name}</span>
              {service.description && <span className="booking-service-description">{service.description}</span>}
              <span className="booking-service-meta"><strong>{idr(service.price_idr)}</strong><span><Clock3 size={12} /> {service.duration_minutes} min</span></span>
            </span>
          </button>;
        })}
      </div> : <div className="booking-empty-service">
        <div className="booking-empty-image"><Image src="/images/service-haircut-detail.jpg" alt="" fill sizes="(max-width: 640px) 100vw, 320px" loading="eager" className="object-cover grayscale" /></div>
        <div><Scissors size={20} /><p className="label mt-4 text-neutral-500">The menu / coming soon</p><h3 className="display mt-2">GOOD THINGS<br />TAKE TIME.</h3><p className="mt-3 text-sm leading-6 text-neutral-600">No services have been published yet. Check back soon to find your next cut.</p><Link href="/services" className="booking-text-link mt-4">Explore the menu <ArrowUpRight size={13} /></Link></div>
      </div>}
      {selectedServices.length > 0 && <div className="booking-selection-total"><span>{selectedServices.length} {selectedServices.length === 1 ? 'service' : 'services'} selected <span>· {totalDuration} min</span></span><strong>{idr(totalPrice)}</strong></div>}
      <StepActions nextLabel="Choose a barber" nextDisabled={!bookingEnabled || !selectedServices.length} onNext={() => goToStep(2)} />
    </section>}

    {step === 2 && <section aria-labelledby="booking-step-barber">
      <StepHeading number="02" id="booking-step-barber" title="Choose your barber" description="Have a favourite? Choose them here, or let us find someone available." />
      <div className="booking-barber-grid" role="group" aria-label="Choose a barber">
        <button type="button" className={`booking-barber-card ${!barberId ? 'is-selected' : ''}`} aria-pressed={!barberId} onClick={() => chooseBarber('')} disabled={!bookingEnabled || !eligibleBarbers.length}>
          <span className="booking-avatar booking-avatar-any"><UsersRound size={23} /></span><span className="booking-barber-copy"><strong>Any available barber</strong><span>We’ll find the right chair for you.</span><small>More flexibility</small></span><span className="booking-selection-mark" aria-hidden="true">{!barberId && <Check size={13} />}</span>
        </button>
        {eligibleBarbers.map(barber => {
          const available = todaySlots.some(slot => slot.barber_id === barber.id && slot.is_available);
          return <button type="button" key={barber.id} className={`booking-barber-card ${barberId === barber.id ? 'is-selected' : ''}`} aria-pressed={barberId === barber.id} onClick={() => chooseBarber(barber.id)} disabled={!bookingEnabled}>
            <span className="booking-avatar">{barber.portrait_url ? <Image src={barber.portrait_url} alt="" fill sizes="72px" unoptimized={!barber.portrait_url.startsWith('/')} className="object-cover grayscale" /> : <UserRound size={23} />}</span>
            <span className="booking-barber-copy"><strong>{barber.name}</strong><span>{barber.specialties.length ? barber.specialties.join(' · ') : barber.bio || 'Terasbarber resident'}</span><small className={barberState === 'ready' && available ? 'is-available' : ''}>{barberState === 'loading' || barberState === 'idle' ? 'Checking today…' : barberState === 'error' ? 'See availability in the next step' : available ? 'Available today' : 'No openings today · check other dates'}</small></span>
            <span className="booking-selection-mark" aria-hidden="true">{barberId === barber.id && <Check size={13} />}</span>
          </button>;
        })}
      </div>
      {!eligibleBarbers.length && <p className="booking-inline-message">No barber is currently assigned to all of these services. Go back and try a different selection.</p>}
      <StepActions back={() => goToStep(1)} nextLabel="Choose date & time" nextDisabled={!bookingEnabled || !eligibleBarbers.length} onNext={() => goToStep(3)} />
    </section>}

    {step === 3 && <section aria-labelledby="booking-step-time">
      <StepHeading number="03" id="booking-step-time" title="Choose date & time" description="Select an available date, then pick the time that works for you." />
      <div className="booking-date-layout">
        <div className="booking-calendar">
          <div className="booking-calendar-header"><button type="button" aria-label="Previous month" disabled={month <= startOfCalendarMonth(today)} onClick={() => moveMonth(-1)}><ChevronLeft size={17} /></button><h3>{calendarMonthLabel(month)}</h3><button type="button" aria-label="Next month" disabled={month >= startOfCalendarMonth(maxDate)} onClick={() => moveMonth(1)}><ChevronRight size={17} /></button></div>
          <div className="booking-calendar-grid booking-weekdays" aria-hidden="true">{weekdays.map((day, index) => <span key={index}>{day}</span>)}</div>
          <div className="booking-calendar-grid" role="group" aria-label="Available dates">
            {monthDates.cells.map((day, index) => day ? <button key={day} type="button" aria-label={calendarDateLabel(day)} aria-pressed={date === day} disabled={calendarState !== 'ready' || day < today || day > maxDate || !calendarMap.get(day)} onClick={() => chooseDate(day)} className={date === day ? 'is-selected' : ''}>{Number(day.slice(-2))}</button> : <span key={`empty-${index}`} />)}
          </div>
          <div className="booking-calendar-footer">{calendarState === 'loading' ? <span role="status"><LoaderCircle className="animate-spin" size={13} /> Checking dates…</span> : <span><i /> Available dates</span>}<span>{timezone}</span></div>
          {calendarState === 'error' && <div role="alert" className="booking-fetch-error">{calendarError} <button type="button" onClick={() => setRefresh(value => value + 1)}>Try again</button></div>}
        </div>
        <div className="booking-times">
          <div className="flex items-center justify-between gap-2"><p className="label">Available times</p>{slotState === 'loading' && <LoaderCircle className="animate-spin" size={15} />}</div>
          {!date ? <div className="booking-times-placeholder"><CalendarDays size={20} /><p>Choose a date to see available times.</p></div> : slotState === 'loading' || slotState === 'idle' ? <div className="booking-times-placeholder" role="status"><LoaderCircle className="animate-spin" size={19} /><p>Checking times…</p></div> : slotState === 'error' ? <div role="alert" className="booking-fetch-error">{slotError} <button type="button" onClick={() => setRefresh(value => value + 1)}>Try again</button></div> : groupedSlots.length ? <>
            <p className="mt-3 text-xs text-neutral-500">{calendarDateLabel(date)}</p>
            <div className="booking-time-grid" role="group" aria-label="Available times">{groupedSlots.map(slot => <button key={slot.starts_at} type="button" aria-label={`${timeLabel(slot.starts_at, timezone)}${slot.is_available ? '' : ', unavailable'}`} aria-pressed={selectedTime === slot.starts_at} disabled={!slot.is_available} className={selectedTime === slot.starts_at ? 'is-selected' : ''} onClick={() => { setSelectedTime(slot.starts_at); setError(''); resetRequest(); }}>{timeLabel(slot.starts_at, timezone)}</button>)}</div>
            <p className="mt-3 text-xs leading-5 text-neutral-500">Crossed-out times are unavailable. Your {totalDuration}-minute visit must fit before closing.</p>
          </> : <div className="booking-times-placeholder"><Clock3 size={19} /><p>No times available. Try another date or barber.</p></div>}
        </div>
      </div>
      <StepActions back={() => goToStep(2)} nextLabel="Your details" nextDisabled={!selectedSlot || slotState !== 'ready'} onNext={() => goToStep(4)} />
    </section>}

    {step === 4 && <section aria-labelledby="booking-step-details">
      <StepHeading number="04" id="booking-step-details" title="Your details" description="Tell us who’s coming in. We’ll use WhatsApp to follow up on your request." />
      <div className="booking-selected-strip"><CalendarDays size={16} /><span>{selectedSlot ? `${calendarDateLabel(date)} · ${timeLabel(selectedSlot.starts_at, timezone)}` : 'Choose a time'}<small>{selectedBarber?.name || 'Any available barber'} · {totalDuration} min</small></span></div>
      <div className="booking-fields">
        <label><span className="label">Full name <span className="text-red-700">*</span></span><input className="form-field" name="customerName" autoComplete="name" maxLength={80} placeholder="Your full name" value={customerName} onChange={event => { setCustomerName(event.target.value); setFieldErrors(current => ({ ...current, name: undefined })); resetRequest(); }} aria-invalid={Boolean(fieldErrors.name)} aria-describedby={fieldErrors.name ? 'booking-name-error' : undefined} /><FieldError id="booking-name-error" message={fieldErrors.name} /></label>
        <label><span className="label">WhatsApp number <span className="text-red-700">*</span></span><input className="form-field" name="customerPhone" type="tel" autoComplete="tel" maxLength={24} placeholder="+62 812 3456 7890" value={customerPhone} onChange={event => { setCustomerPhone(event.target.value); setFieldErrors(current => ({ ...current, phone: undefined })); resetRequest(); }} aria-invalid={Boolean(fieldErrors.phone)} aria-describedby={fieldErrors.phone ? 'booking-phone-error' : undefined} /><FieldError id="booking-phone-error" message={fieldErrors.phone} /></label>
        <label className="booking-notes-field"><span className="label">Note for your barber <span className="font-normal normal-case tracking-normal text-neutral-500">(optional)</span></span><textarea className="form-field min-h-28 resize-y" name="notes" maxLength={500} placeholder="Cut preferences or anything else we should know" value={notes} onChange={event => { setNotes(event.target.value); resetRequest(); }} /><span className="booking-character-count">{notes.length} / 500</span></label>
      </div>
      <label className="booking-consent"><input type="checkbox" checked={consent} onChange={event => { setConsent(event.target.checked); setFieldErrors(current => ({ ...current, consent: undefined })); }} aria-invalid={Boolean(fieldErrors.consent)} aria-describedby={fieldErrors.consent ? 'booking-consent-error' : undefined} /><span>I agree that my details can be used to manage this appointment. Read the <Link href="/privacy" className="underline underline-offset-2">privacy notice</Link>.</span></label>
      <FieldError id="booking-consent-error" message={fieldErrors.consent} />
      <StepActions back={() => goToStep(3)} nextLabel="Review booking" onNext={continueToReview} />
    </section>}

    {step === 5 && selectedServices.length > 0 && selectedSlot && <section aria-labelledby="booking-step-review">
      <StepHeading number="05" id="booking-step-review" title="Review your booking" description="Everything look right? Send your request to the shop." />
      <div className="booking-review-services"><p className="label text-neutral-500">Your services</p>{selectedServices.map(service => <div key={service.id}><span><strong>{service.name}</strong><small>{service.duration_minutes} min</small></span><strong>{idr(service.price_idr)}</strong></div>)}</div>
      <dl className="booking-review-details"><Summary label="Barber" value={selectedBarber?.name || 'Any available barber'} detail={!barberId ? 'Assigned when your request is saved' : undefined} /><Summary label="Date & time" value={`${calendarDateLabel(date)} · ${timeLabel(selectedSlot.starts_at, timezone)}`} detail={timezone} /><Summary label="Name" value={customerName.trim()} /><Summary label="WhatsApp" value={customerPhone.trim()} />{notes.trim() && <Summary label="Notes" value={notes.trim()} />}<Summary label="Total" value={idr(totalPrice)} detail={`${totalDuration} min`} strong /></dl>
      <p className="booking-policy"><ShieldCheck size={17} /><span>This is an appointment request, not a confirmed booking. Your slot is held for 30 minutes after the request is saved, while the shop confirms it.</span></p>
      <div className="booking-actions"><button type="button" className="btn-outline" disabled={submitting} onClick={() => goToStep(4)}><ArrowLeft size={14} /> Back</button><button type="submit" className="btn-primary" disabled={submitting || !bookingEnabled}>{submitting ? <>Saving request <LoaderCircle className="animate-spin" size={15} /></> : <>Confirm request <ArrowUpRight size={15} /></>}</button></div>
    </section>}
  </form>;
}

function StepHeading({ number, id, title, description }: { number: string; id: string; title: string; description: string }) {
  return <div className="booking-step-heading"><p className="label text-neutral-500">{number} / {steps[Number(number) - 1].short}</p><h2 id={id} className="display">{title}<span className="text-lime">.</span></h2><p>{description}</p></div>;
}
function StepActions({ back, nextLabel, nextDisabled = false, onNext }: { back?: () => void; nextLabel: string; nextDisabled?: boolean; onNext: () => void }) {
  return <div className={`booking-actions ${!back ? 'is-first' : ''}`}>{back && <button type="button" className="btn-outline" onClick={back}><ArrowLeft size={14} /> Back</button>}<button type="button" className="btn-primary" disabled={nextDisabled} onClick={onNext}>{nextLabel} <ArrowRight size={15} /></button></div>;
}
function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? <span id={id} className="booking-field-error">{message}</span> : null;
}
function Summary({ label, value, detail, strong = false }: { label: string; value: string; detail?: string; strong?: boolean }) {
  return <div className="booking-summary-row"><dt>{label}</dt><dd className={strong ? 'is-strong' : ''}>{value}{detail && <small>{detail}</small>}</dd></div>;
}
