'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock3, LoaderCircle, QrCode, RefreshCw, Store } from 'lucide-react';
import { idr } from '@/lib/format';

export type PaymentStatus = 'unpaid' | 'pending' | 'paid' | 'expired' | 'failed' | 'refunded';
export type PaymentMethod = 'qris' | 'pay_at_barber';

export type PaymentSnapshot = {
  method: PaymentMethod;
  status: PaymentStatus;
  qrImageUrl?: string | null;
  expiresAt?: string | null;
  bookingStatus?: string;
  note?: string | null;
};

export const paymentStatusLabels: Record<PaymentStatus, string> = {
  unpaid: 'Belum dibayar',
  pending: 'Menunggu pembayaran',
  paid: 'Sudah dibayar',
  expired: 'Kedaluwarsa',
  failed: 'Gagal',
  refunded: 'Dikembalikan'
};

export const paymentMethodLabels: Record<PaymentMethod, string> = {
  qris: 'QRIS',
  pay_at_barber: 'Bayar di Barbershop'
};

function countdownLabel(expiresAt: string | null | undefined, now: number) {
  if (!expiresAt) return null;
  const remaining = Math.floor((new Date(expiresAt).getTime() - now) / 1000);
  if (!Number.isFinite(remaining)) return null;
  if (remaining <= 0) return '00:00';
  const minutes = Math.floor(remaining / 60).toString().padStart(2, '0');
  const seconds = (remaining % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

export function PaymentPanel({ payment, pollUrl, price, className = '' }: {
  payment: PaymentSnapshot;
  pollUrl?: string | null;
  price?: number;
  className?: string;
}) {
  const [snapshot, setSnapshot] = useState(payment);
  const [syncedPayment, setSyncedPayment] = useState(payment);
  const [now, setNow] = useState(() => Date.now());
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState('');
  const [pollNonce, setPollNonce] = useState(0);

  // Reset the local snapshot when the parent supplies a different payment block.
  if (payment !== syncedPayment) {
    setSyncedPayment(payment);
    setSnapshot(payment);
  }

  const isWaiting = snapshot.method === 'qris' && snapshot.status === 'pending';
  const expiresAtMs = snapshot.expiresAt ? new Date(snapshot.expiresAt).getTime() : null;
  const expiredByClock = Boolean(isWaiting && expiresAtMs && now >= expiresAtMs);

  useEffect(() => {
    if (!isWaiting) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [isWaiting, pollNonce]);

  useEffect(() => {
    if (!isWaiting || !pollUrl) return;
    let cancelled = false;
    const controller = new AbortController();
    let timeout = 0;

    let settled = false;
    const check = async () => {
      setChecking(true);
      try {
        const response = await fetch(pollUrl, { cache: 'no-store', signal: controller.signal });
        const body = await response.json();
        if (!response.ok) throw new Error(typeof body.error === 'string' ? body.error : 'Status pembayaran tidak dapat dimuat.');
        const next = body.payment as { method: PaymentMethod; status: PaymentStatus; expiresAt: string | null; paidAt: string | null };
        if (cancelled) return;
        setCheckError('');
        setSnapshot(current => ({ ...current, method: next.method, status: next.status, expiresAt: next.expiresAt ?? current.expiresAt }));
        if (next.status === 'paid') settled = true;
      } catch (cause) {
        if (!cancelled && !controller.signal.aborted) setCheckError(cause instanceof Error ? cause.message : 'Status pembayaran tidak dapat dimuat.');
      } finally {
        if (!cancelled) setChecking(false);
      }
      if (!cancelled && !settled) timeout = window.setTimeout(check, 6000);
    };

    timeout = window.setTimeout(check, 4000);
    return () => { cancelled = true; controller.abort(); window.clearTimeout(timeout); };
  }, [isWaiting, pollUrl, pollNonce]);

  const countdown = useMemo(() => countdownLabel(snapshot.expiresAt, now), [snapshot.expiresAt, now]);

  if (snapshot.method === 'pay_at_barber') {
    return <div className={`booking-payment ${className}`}>
      <p className="label flex items-center gap-2 text-neutral-500"><Store size={14} /> Metode pembayaran</p>
      <p className="booking-payment-title">Bayar di Barbershop</p>
      <p className="booking-payment-copy">Tidak perlu transfer sekarang. Datang beberapa menit sebelum jadwal dan bayar langsung di kasir setelah potong rambut.</p>
      {typeof price === 'number' && <p className="booking-payment-amount"><span>Total dibayar di kasir</span><strong>{idr(price)}</strong></p>}
      {snapshot.note && <p role="status" className="booking-payment-note">{snapshot.note}</p>}
    </div>;
  }

  if (snapshot.status === 'paid') {
    return <div className={`booking-payment is-paid ${className}`} aria-live="polite">
      <p className="label flex items-center gap-2 text-neutral-500"><CheckCircle2 size={14} /> Metode pembayaran</p>
      <p className="booking-payment-title">QRIS · Pembayaran diterima</p>
      <p className="booking-payment-copy">Terima kasih, pembayaran QRIS Anda sudah kami terima dan jadwal otomatis dikonfirmasi.</p>
      {typeof price === 'number' && <p className="booking-payment-amount"><span>Total dibayar</span><strong>{idr(price)}</strong></p>}
    </div>;
  }

  if (snapshot.status === 'expired' || snapshot.status === 'failed' || expiredByClock) {
    return <div className={`booking-payment is-warning ${className}`} aria-live="polite">
      <p className="label flex items-center gap-2 text-neutral-500"><Clock3 size={14} /> Metode pembayaran</p>
      <p className="booking-payment-title">QRIS kedaluwarsa</p>
      <p className="booking-payment-copy">Batas waktu pembayaran QRIS sudah lewat sehingga slot ini dilepas. Silakan booking ulang, atau hubungi shop untuk membayar di tempat.</p>
    </div>;
  }

  return <div className={`booking-payment is-qris ${className}`} aria-live="polite">
    <div className="booking-payment-head">
      <div>
        <p className="label flex items-center gap-2 text-neutral-500"><QrCode size={14} /> Pindai untuk membayar · QRIS</p>
        <p className="booking-payment-title">Selesaikan pembayaran</p>
      </div>
      {countdown && <span className={`booking-payment-timer ${expiredByClock ? 'is-over' : ''}`}><Clock3 size={13} /> {countdown}</span>}
    </div>
    <div className="booking-payment-body">
      <div className="booking-payment-qr">
        {snapshot.qrImageUrl
          // eslint-disable-next-line @next/next/no-img-element -- The QR is a same-origin proxy of a short-lived payment code.
          ? <img src={snapshot.qrImageUrl} alt="Kode QRIS untuk membayar booking ini" width={232} height={232} />
          : <p className="booking-payment-qr-empty">Kode QRIS sedang disiapkan…</p>}
      </div>
      <div className="booking-payment-side">
        <p className="booking-payment-copy">Buka aplikasi e-wallet atau mobile banking apa pun yang mendukung QRIS, lalu pindai kode di samping. Pembayaran diverifikasi otomatis.</p>
        {typeof price === 'number' && <p className="booking-payment-amount"><span>Total tagihan</span><strong>{idr(price)}</strong></p>}
        <p className="booking-payment-status"><LoaderCircle className={checking ? 'animate-spin' : ''} size={13} /> {checking ? 'Memeriksa pembayaran…' : 'Menunggu pembayaran masuk'}</p>
        {pollUrl && <button type="button" className="booking-offline-sync" onClick={() => { setNow(Date.now()); setPollNonce(value => value + 1); }}><RefreshCw size={12} /> Perbarui status</button>}
        {checkError && <p className="booking-payment-note is-error">{checkError}</p>}
      </div>
    </div>
    <p className="booking-payment-note">Selesaikan pembayaran sebelum hitungan berakhir. Bila kedaluwarsa, slot akan dilepas dan Anda bisa booking ulang.</p>
  </div>;
}
