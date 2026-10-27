'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft, ArrowUpRight, Check, Clock3, LoaderCircle } from 'lucide-react';
import { idr } from '@/lib/format';
import { serviceImage, serviceImageIsIllustrative, type ServiceCategory } from '@/lib/service-visual';
import { bookingSlotKey, type BookingSlot } from '@/lib/booking-slots';

type ServiceOption = { id: string; name: string; description: string; category: ServiceCategory; image_url: string | null; price_idr: number; duration_minutes: number };
type BarberOption = { id: string; name: string; serviceIds: string[] };
type Completed = { code: string; service: string; barber: string; startsAt: string; manageUrl: string };

function timeLabel(value: string, timezone: string) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(value));
}
function dateAtTimezone(date: string, timezone: string) {
  return new Intl.DateTimeFormat('en', { timeZone: timezone, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(date));
}

export function BookingForm({ services, barbers, timezone, today, horizonDays, configured, initialServiceId = '', initialBarberId = '' }: {
  services: ServiceOption[]; barbers: BarberOption[]; timezone: string; today: string; horizonDays: number; configured: boolean; initialServiceId?: string; initialBarberId?: string;
}) {
  const maxDate = useMemo(() => {
    const [year, month, day] = today.split('-').map(Number);
    const limit = new Date(Date.UTC(year, month - 1, day + horizonDays));
    return limit.toISOString().slice(0, 10);
  }, [today, horizonDays]);
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

  useEffect(() => {
    if (!configured || !serviceId || !date) return;
    const controller = new AbortController();
    const query = new URLSearchParams({ date, serviceId });
    if (barberFilter) query.set('barberId', barberFilter);
    fetch(`/api/availability?${query}`, { signal: controller.signal, cache: 'no-store' })
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'Unable to check available times.');
        return body.slots as BookingSlot[];
      })
      .then(data => { setSlots(data); setSlotValue(''); })
      .catch(reason => { if (reason.name !== 'AbortError') { setSlots([]); setError(reason.message); } })
      .finally(() => { if (!controller.signal.aborted) setLoadingSlots(false); });
    return () => controller.abort();
  }, [configured, serviceId, barberFilter, date]);

  const selectedSlot = slots.find(slot => bookingSlotKey(slot) === slotValue);
  const selectedService = services.find(service => service.id === serviceId);
  const eligibleBarbers = serviceId ? barbers.filter(barber => barber.serviceIds.includes(serviceId)) : barbers;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (!selectedSlot) { setError('Choose an available time first.'); return; }
    if (!consent) { setError('Please confirm you agree to the booking privacy notice.'); return; }
    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    try {
      const response = await fetch('/api/bookings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceId,
          barberId: selectedSlot.barber_id,
          startsAt: selectedSlot.starts_at,
          customerName: String(form.get('customerName') || ''),
          customerPhone: String(form.get('customerPhone') || ''),
          notes: String(form.get('notes') || '')
        })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Your booking could not be saved.');
      setCompleted({ ...body.booking, manageUrl: body.manageUrl });
      setWhatsappUrl(body.whatsappUrl);
      setWhatsappRecipient(body.whatsappRecipient === 'barber' ? 'barber' : 'shop');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Your booking could not be saved.');
      if (reason instanceof Error && reason.message.includes('just taken')) setSlotValue('');
    } finally { setSubmitting(false); }
  }

  if (completed) return <section aria-live="polite" className="border border-ink bg-lime p-6 sm:p-9">
    <div className="mb-5 grid size-10 place-items-center border border-ink"><Check size={20} /></div>
    <p className="label mb-3">Request received · {completed.code}</p>
    <h2 className="display text-4xl sm:text-6xl">ONE STEP<br />TO THE CHAIR.</h2>
    <p className="mt-4 max-w-lg text-sm leading-6">Your request for {completed.service} with {completed.barber} on {dateAtTimezone(completed.startsAt, timezone)} at {timeLabel(completed.startsAt, timezone)} is saved as pending until the shop confirms it.</p>
    {whatsappUrl ? <a className="btn-dark mt-7" href={whatsappUrl} target="_blank" rel="noreferrer">Message {whatsappRecipient === 'barber' ? completed.barber : 'the shop'} on WhatsApp <ArrowUpRight size={15} /></a> : <p className="mt-6 border-t border-black/20 pt-4 text-xs">No WhatsApp contact is configured yet. Your request is still saved and assigned to {completed.barber}; keep your booking code and contact the shop using its published details.</p>}
    <Link href={completed.manageUrl} className="btn-outline mt-4 w-full sm:w-auto">Manage, reschedule, or cancel <ArrowUpRight size={14} /></Link>
    <p className="mt-5 text-[10px] font-semibold uppercase tracking-[.12em]">Booking code: {completed.code}</p>
    <button type="button" className="label mt-7 flex items-center gap-2 underline underline-offset-4" onClick={() => { setCompleted(null); setWhatsappUrl(null); }}><ArrowLeft size={13} /> Make another booking</button>
  </section>;

  return <form onSubmit={submit} className="border border-black/20 bg-cream p-5 sm:p-9">
    {!configured && <div role="status" className="mb-6 border-l-4 border-lime bg-white p-4 text-sm">Booking is unavailable until the database, protected booking secrets, and shop schedule are configured.</div>}
    {error && <div role="alert" className="mb-5 border border-red-800/25 bg-red-50 p-3 text-sm text-red-900">{error}</div>}
    <div className="mb-8 flex items-center justify-between border-b border-black/20 pb-4"><span className="label">Appointment details</span><span className="label text-neutral-500">01 — 04</span></div>
    <div className="form-grid grid grid-cols-2 gap-x-4">
      <div className="col-span-2 mb-6">
        <span className="label mb-3 block">01 / Choose your service</span>
        {services.length ? <div className="booking-service-grid grid gap-3 sm:grid-cols-2 xl:grid-cols-3" role="group" aria-label="Choose a service">
          {services.map(service => {
            const image = serviceImage(service);
            const illustrative = serviceImageIsIllustrative(service);
            const selected = serviceId === service.id;
            return <button key={service.id} type="button" disabled={!configured} aria-pressed={selected} onClick={() => {
              setServiceId(service.id);
              if (barberFilter && !barbers.find(barber => barber.id === barberFilter)?.serviceIds.includes(service.id)) setBarberFilter('');
              setSlots([]); setSlotValue(''); setError(''); setLoadingSlots(Boolean(configured));
            }} className={`booking-service-card text-left ${selected ? 'is-selected' : ''}`}>
              <div className="booking-service-image image-frame relative aspect-[4/3] bg-[#d8d4cc]"><Image src={image} alt={illustrative ? `Illustrative ${service.category.toLowerCase()} service photo` : `${service.name} service`} fill sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw" unoptimized className="object-cover grayscale transition-transform duration-500" />{illustrative && <span className="absolute bottom-2 left-2 bg-ink/85 px-2 py-1 text-[8px] font-bold uppercase tracking-[.12em] text-white">Category illustration</span>}</div>
              <span className="booking-service-info block p-3 sm:p-4"><span className="flex items-center justify-between gap-2"><span className="label text-neutral-500">{service.category} / {service.duration_minutes} min</span><span className="text-xs font-bold">{idr(service.price_idr)}</span></span><span className="display mt-3 block text-2xl">{service.name}</span>{service.description && <span className="mt-2 block line-clamp-2 text-xs leading-5 text-neutral-600">{service.description}</span>}</span>
            </button>;
          })}
        </div> : <p className="border border-black/15 px-4 py-5 text-sm text-neutral-600">No published services are available yet.</p>}
      </div>
      <label className="mb-5"><span className="label mb-2 block">02 / Barber</span><select className="form-field" value={barberFilter} onChange={event => { setBarberFilter(event.target.value); setSlots([]); setSlotValue(''); setError(''); setLoadingSlots(Boolean(configured && serviceId)); }} disabled={!configured || !serviceId || eligibleBarbers.length === 0}><option value="">Any available barber</option>{eligibleBarbers.map(barber => <option key={barber.id} value={barber.id}>{barber.name}</option>)}</select><span className="mt-2 block text-[10px] text-neutral-500">Only barbers assigned to this service are listed.</span></label>
      <label className="mb-5"><span className="label mb-2 block">03 / Date</span><input className="form-field" type="date" min={today} max={maxDate} value={date} onChange={event => { setDate(event.target.value); setSlots([]); setSlotValue(''); setError(''); setLoadingSlots(Boolean(configured && serviceId && event.target.value)); }} required disabled={!configured || !serviceId} /></label>
      <label className="col-span-2 mb-5"><span className="label mb-2 flex items-center justify-between">04 / Available start times {loadingSlots && <LoaderCircle className="animate-spin" size={15} />}</span><select className="form-field" value={slotValue} onChange={event => setSlotValue(event.target.value)} required disabled={!configured || loadingSlots || !serviceId || slots.length === 0}><option value="">{loadingSlots ? 'Checking availability…' : slots.length ? 'Choose a time and barber' : 'No available times for this day'}</option>{slots.map(slot => <option key={bookingSlotKey(slot)} value={bookingSlotKey(slot)}>{timeLabel(slot.starts_at, timezone)} — {slot.barber_name}</option>)}</select><span className="mt-2 flex items-center gap-1 text-[10px] text-neutral-500"><Clock3 size={11} /> Times are shown in {timezone}; each option is reserved for the barber named beside it.</span></label>
      <label className="mb-5"><span className="label mb-2 block">Your name</span><input className="form-field" name="customerName" type="text" minLength={2} maxLength={80} autoComplete="name" placeholder="Name" required disabled={!configured} /></label>
      <label className="mb-5"><span className="label mb-2 block">WhatsApp / phone</span><input className="form-field" name="customerPhone" type="tel" minLength={8} maxLength={24} autoComplete="tel" placeholder="+62…" required disabled={!configured} /></label>
      <label className="col-span-2 mb-5"><span className="label mb-2 block">Anything we should know? <span className="font-normal normal-case tracking-normal">(optional)</span></span><textarea className="form-field min-h-24 resize-y" name="notes" maxLength={500} placeholder="A note for your barber" disabled={!configured} /></label>
    </div>
    <label className="mb-6 flex items-start gap-3 text-xs leading-5 text-neutral-600"><input className="mt-1 accent-black" type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} disabled={!configured} /><span>I agree that Terasbarber may use these details to manage this appointment. See the <Link href="/privacy" className="underline">privacy notice</Link>.</span></label>
    <button type="submit" className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-40" disabled={!configured || submitting || !selectedService || !selectedSlot}>{submitting ? 'Saving request…' : 'Request this appointment'}{submitting ? <LoaderCircle className="animate-spin" size={15} /> : <ArrowUpRight size={15} />}</button>
    <p className="mt-4 text-center text-[10px] leading-5 text-neutral-500">Your appointment is not confirmed until the shop confirms with you.</p>
  </form>;
}
