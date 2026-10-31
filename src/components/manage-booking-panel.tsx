'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CalendarClock, Check, Clock3, LoaderCircle, X } from 'lucide-react';
import { bookingSlotKey, type BookingSlot } from '@/lib/booking-slots';

type ManageBooking = {
  booking_code: string;
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'no_show';
  service_name: string;
  barber_name: string;
  starts_at: string;
  ends_at: string;
  service_id: string;
  barber_id: string;
  price_idr: number;
  duration_minutes: number;
  timezone: string;
  can_cancel: boolean;
  can_reschedule: boolean;
  cancellation_deadline_minutes: number;
  reschedule_deadline_minutes: number;
};

const statusLabels: Record<ManageBooking['status'], string> = {
  pending: 'Menunggu konfirmasi', confirmed: 'Dikonfirmasi', cancelled: 'Dibatalkan', completed: 'Selesai', no_show: 'Tidak hadir'
};
const money = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });

function localDate(value: string, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value));
  const get = (type: string) => parts.find(part => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}
function dateTime(value: string, timezone: string) {
  return new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: timezone }).format(new Date(value));
}
function timeLabel(value: string, timezone: string) {
  return new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: timezone }).format(new Date(value));
}
function todayInTimezone(timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const get = (type: string) => parts.find(part => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function ManageBookingPanel({ token }: { token: string }) {
  const [booking, setBooking] = useState<ManageBooking | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [reason, setReason] = useState('');
  const [date, setDate] = useState('');
  const [slots, setSlots] = useState<BookingSlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState('');
  const [loadingSlots, setLoadingSlots] = useState(false);
  const tokenPath = useMemo(() => `/api/manage-booking/${encodeURIComponent(token)}`, [token]);

  useEffect(() => {
    const controller = new AbortController();
    fetch(tokenPath, { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'Tautan booking tidak dapat dibuka.');
        return body.booking as ManageBooking;
      })
      .then(data => { setBooking(data); setDate(localDate(data.starts_at, data.timezone)); setLoadingSlots(data.can_reschedule); })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Booking tidak dapat dimuat.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [tokenPath]);

  useEffect(() => {
    if (!booking?.can_reschedule || !date) return;
    const controller = new AbortController();
    const query = new URLSearchParams({ date, serviceId: booking.service_id, barberId: booking.barber_id });
    fetch(`/api/availability?${query}`, { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'Jadwal tidak dapat dimuat.');
        return body.slots as BookingSlot[];
      })
      .then(data => { setSlots(data); setSelectedSlot(''); })
      .catch(cause => { if (!controller.signal.aborted) { setSlots([]); setError(cause instanceof Error ? cause.message : 'Jadwal tidak dapat dimuat.'); } })
      .finally(() => { if (!controller.signal.aborted) setLoadingSlots(false); });
    return () => controller.abort();
  }, [booking?.can_reschedule, booking?.service_id, booking?.barber_id, booking?.starts_at, date]);

  async function submit(action: 'cancel' | 'reschedule') {
    if (action === 'cancel' && !window.confirm('Yakin ingin membatalkan janji temu ini?')) return;
    const selected = slots.find(slot => bookingSlotKey(slot) === selectedSlot);
    if (action === 'reschedule' && !selected) { setError('Pilih jadwal pengganti yang tersedia.'); return; }
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch(tokenPath, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action === 'cancel' ? { action, reason } : { action, startsAt: selected?.starts_at })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Perubahan tidak dapat disimpan.');
      const updated = body.booking as ManageBooking;
      setBooking(updated);
      setDate(localDate(updated.starts_at, updated.timezone));
      if (action === 'cancel') { setSlots([]); setSelectedSlot(''); setLoadingSlots(false); }
      else setLoadingSlots(updated.can_reschedule);
      setMessage(action === 'cancel' ? 'Booking berhasil dibatalkan.' : 'Jadwal booking berhasil diubah.');
      setReason('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Perubahan tidak dapat disimpan.');
    } finally { setBusy(false); }
  }

  if (loading) return <div lang="id" className="grid min-h-64 place-items-center" role="status"><LoaderCircle aria-hidden="true" className="animate-spin" /> <span className="sr-only">Memuat booking</span></div>;
  if (!booking) return <section lang="id" className="max-w-2xl border border-black/20 p-6 sm:p-10"><p className="label text-neutral-500">Kelola janji temu</p><h1 className="display mt-4 text-5xl">BOOKING<br />TIDAK DAPAT DIAKSES.</h1><p role="alert" className="mt-5 text-sm leading-6 text-neutral-600">{error || 'Periksa tautan atau coba lagi sebentar.'}</p><Link href="/book" className="btn-dark mt-7 inline-flex"><ArrowLeft size={14} /> Kembali ke booking</Link></section>;

  const today = todayInTimezone(booking.timezone);
  const slotOptions = slots.map(slot => ({ key: bookingSlotKey(slot), slot }));
  return <div lang="id" className="mx-auto max-w-3xl">
    <Link href="/book" className="label mb-8 inline-flex min-h-11 items-center gap-2 text-neutral-500"><ArrowLeft size={13} /> Kembali ke booking</Link>
    <p className="label text-neutral-500">Kelola janji temu · {booking.booking_code}</p>
    <h1 className="display mt-3 text-5xl sm:text-7xl">BOOKING<br />ANDA<span className="text-lime">.</span></h1>
    {message && <p role="status" className="mt-6 flex items-center gap-2 border border-green-800/20 bg-green-50 p-4 text-sm"><Check size={16} />{message}</p>}
    {error && <p role="alert" className="mt-6 border border-red-800/20 bg-red-50 p-4 text-sm text-red-900">{error}</p>}
    <section className="mt-8 border-y border-black/20 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><span className="label">Rincian appointment</span><span className="badge">{statusLabels[booking.status]}</span></div>
      <dl className="mt-5 grid gap-5 text-sm sm:grid-cols-2">
        <div><dt className="label text-neutral-500">Layanan</dt><dd className="mt-1 font-semibold">{booking.service_name}</dd></div>
        <div><dt className="label text-neutral-500">Barber</dt><dd className="mt-1 font-semibold">{booking.barber_name}</dd></div>
        <div><dt className="label text-neutral-500">Tanggal & waktu</dt><dd className="mt-1 font-semibold">{dateTime(booking.starts_at, booking.timezone)}</dd></div>
        <div><dt className="label text-neutral-500">Durasi & harga</dt><dd className="mt-1 font-semibold">{booking.duration_minutes} menit · {money.format(booking.price_idr)}</dd></div>
      </dl>
      <p className="mt-5 flex items-center gap-2 text-xs text-neutral-500"><Clock3 size={13} /> Zona waktu {booking.timezone}</p>
    </section>

    {booking.can_reschedule && <section className="mt-8 border border-black/20 p-5 sm:p-7">
      <p className="label flex items-center gap-2"><CalendarClock size={14} /> Ubah jadwal</p>
      <p className="mt-2 text-xs leading-5 text-neutral-600">Pilih waktu baru untuk layanan dan barber yang sama. Jadwal lama tetap tersimpan jika waktu baru tidak tersedia.</p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label><span className="label mb-2 block">Tanggal baru</span><input type="date" min={today} value={date} onChange={event => { const nextDate = event.target.value; setDate(nextDate); setSelectedSlot(''); setLoadingSlots(Boolean(nextDate)); setError(''); }} className="form-field" /></label>
        <label><span className="label mb-2 flex items-center justify-between">Waktu tersedia {loadingSlots && <LoaderCircle className="animate-spin" size={14} />}</span><select className="form-field" value={selectedSlot} disabled={loadingSlots || slots.length === 0} onChange={event => setSelectedSlot(event.target.value)}><option value="">{loadingSlots ? 'Memuat jadwal…' : slots.length ? 'Pilih waktu' : 'Tidak ada waktu tersedia'}</option>{slotOptions.map(({ key, slot }) => <option key={key} value={key}>{timeLabel(slot.starts_at, booking.timezone)}</option>)}</select></label>
      </div>
      <button type="button" className="btn-primary mt-5 w-full disabled:opacity-40 sm:w-auto" disabled={busy || loadingSlots || !selectedSlot} onClick={() => submit('reschedule')}>{busy ? 'Menyimpan…' : 'Simpan jadwal baru'}{busy && <LoaderCircle className="animate-spin" size={14} />}</button>
    </section>}

    {booking.can_cancel ? <section className="mt-6 border border-black/20 p-5 sm:p-7">
      <p className="label flex items-center gap-2"><X size={14} /> Batalkan booking</p>
      <p className="mt-2 text-xs leading-5 text-neutral-600">Pembatalan tersedia sampai {booking.cancellation_deadline_minutes ? `${booking.cancellation_deadline_minutes} menit` : 'waktu mulai'} sebelum jadwal.</p>
      <label className="mt-4 block"><span className="label mb-2 block">Alasan (opsional)</span><input className="form-field" value={reason} onChange={event => setReason(event.target.value)} maxLength={300} placeholder="Tulis alasan singkat" /></label>
      <button type="button" className="btn-outline mt-5 disabled:opacity-40" disabled={busy} onClick={() => submit('cancel')}>{busy ? 'Memproses…' : 'Batalkan booking'}</button>
    </section> : booking.status === 'pending' || booking.status === 'confirmed' ? <p className="mt-6 text-xs leading-5 text-neutral-500">Batas perubahan booking telah lewat. Hubungi shop jika Anda memerlukan bantuan.</p> : null}
    <p className="mt-8 text-[10px] leading-5 text-neutral-500">Simpan tautan aman ini untuk mengakses booking. Tautan berlaku selama 90 hari dan jangan bagikan kepada orang lain.</p>
  </div>;
}
