import type { PaymentMethod, PaymentStatus } from '@/components/payment-panel';

export const paymentMethodShortLabels: Record<PaymentMethod, string> = {
  qris: 'QRIS',
  pay_at_barber: 'Bayar di barbershop'
};

export const paymentStatusShortLabels: Record<PaymentStatus, string> = {
  unpaid: 'Belum dibayar',
  pending: 'Menunggu QRIS',
  paid: 'Lunas',
  expired: 'QRIS kedaluwarsa',
  failed: 'Gagal',
  refunded: 'Dikembalikan'
};

export function paymentSummary(method: string | null, status: string | null) {
  const methodLabel = method === 'qris' ? paymentMethodShortLabels.qris : paymentMethodShortLabels.pay_at_barber;
  const statusLabel = status && status in paymentStatusShortLabels
    ? paymentStatusShortLabels[status as PaymentStatus]
    : paymentStatusShortLabels.unpaid;
  return `${methodLabel} · ${statusLabel}`;
}

export function isPaid(status: string | null) {
  return status === 'paid';
}
