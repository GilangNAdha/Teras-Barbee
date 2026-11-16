import { createHash, timingSafeEqual } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

export type PaymentMethod = 'qris' | 'pay_at_barber';
export type PaymentStatus = 'unpaid' | 'pending' | 'paid' | 'expired' | 'failed' | 'refunded';

export type MidtransTransition = {
  paymentStatus: PaymentStatus;
  autoConfirmAppointment: boolean;
  autoCancelPendingHold: boolean;
};

export type MidtransQrisChargeResult = {
  orderId: string;
  transactionId: string;
  qrUrl: string | null;
  qrString: string | null;
  expiresAt: string;
};

export function getMidtransServerKey(): string | null {
  const value = process.env.MIDTRANS_SERVER_KEY?.trim();
  return value ? value : null;
}

export function isMidtransConfigured(): boolean {
  return Boolean(getMidtransServerKey());
}

export function getMidtransBaseUrl(serverKey = getMidtransServerKey()): string {
  const explicit = process.env.MIDTRANS_IS_PRODUCTION?.trim().toLowerCase();
  if (explicit === 'true' || explicit === '1') return 'https://api.midtrans.com';
  if (explicit === 'false' || explicit === '0') return 'https://api.sandbox.midtrans.com';
  if (serverKey && !serverKey.startsWith('SB-')) return 'https://api.midtrans.com';
  return 'https://api.sandbox.midtrans.com';
}

export function isAllowedMidtransQrUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && (
      parsed.hostname === 'api.midtrans.com' ||
      parsed.hostname === 'api.sandbox.midtrans.com'
    );
  } catch {
    return false;
  }
}

export function computeMidtransSignature(params: {
  orderId: string;
  statusCode: string;
  grossAmount: string;
  serverKey: string;
}): string {
  return createHash('sha512')
    .update(`${params.orderId}${params.statusCode}${params.grossAmount}${params.serverKey}`)
    .digest('hex');
}

export function verifyMidtransSignature(params: {
  orderId: string;
  statusCode: string;
  grossAmount: string;
  signatureKey: string;
  serverKey?: string | null;
}): boolean {
  const key = params.serverKey ?? getMidtransServerKey();
  if (!key || !params.signatureKey) return false;
  const expected = computeMidtransSignature({
    orderId: params.orderId,
    statusCode: params.statusCode,
    grossAmount: params.grossAmount,
    serverKey: key
  });
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(params.signatureKey.trim().toLowerCase(), 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function mapMidtransPaymentState(
  transactionStatus: string,
  fraudStatus?: string | null
): MidtransTransition {
  const normalized = transactionStatus.trim().toLowerCase();
  const fraud = (fraudStatus ?? '').trim().toLowerCase();

  if (normalized === 'settlement' || (normalized === 'capture' && fraud !== 'challenge' && fraud !== 'deny')) {
    return { paymentStatus: 'paid', autoConfirmAppointment: true, autoCancelPendingHold: false };
  }
  if (normalized === 'pending' || (normalized === 'capture' && fraud === 'challenge')) {
    return { paymentStatus: 'pending', autoConfirmAppointment: false, autoCancelPendingHold: false };
  }
  if (normalized === 'expire') {
    return { paymentStatus: 'expired', autoConfirmAppointment: false, autoCancelPendingHold: true };
  }
  if (normalized === 'refund' || normalized === 'partial_refund') {
    return { paymentStatus: 'refunded', autoConfirmAppointment: false, autoCancelPendingHold: false };
  }
  return { paymentStatus: 'failed', autoConfirmAppointment: false, autoCancelPendingHold: true };
}

function parseMidtransExpiry(expiryTime: unknown): string {
  if (typeof expiryTime === 'string') {
    // Midtrans returns WIB timestamps formatted as "YYYY-MM-DD HH:mm:ss".
    const match = expiryTime.trim().match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})$/);
    if (match) {
      const parsed = new Date(`${match[1]}T${match[2]}+07:00`);
      if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
    }
    const direct = new Date(expiryTime);
    if (!Number.isNaN(direct.getTime())) return direct.toISOString();
  }
  return new Date(Date.now() + 15 * 60_000).toISOString();
}

function authHeader(serverKey: string): string {
  return `Basic ${Buffer.from(`${serverKey}:`).toString('base64')}`;
}

export async function chargeMidtransQris(params: {
  orderId: string;
  grossAmount: number;
  customerName: string;
  customerPhone: string;
  serviceSummary: string;
}): Promise<MidtransQrisChargeResult> {
  const serverKey = getMidtransServerKey();
  if (!serverKey) throw new Error('midtrans_not_configured');
  const baseUrl = getMidtransBaseUrl(serverKey);

  const response = await fetch(`${baseUrl}/v2/charge`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: authHeader(serverKey)
    },
    body: JSON.stringify({
      payment_type: 'qris',
      transaction_details: {
        order_id: params.orderId,
        gross_amount: params.grossAmount
      },
      customer_details: {
        first_name: params.customerName.slice(0, 50),
        phone: params.customerPhone.slice(0, 24)
      },
      item_details: [
        {
          id: 'booking-services',
          price: params.grossAmount,
          quantity: 1,
          name: params.serviceSummary.slice(0, 50)
        }
      ],
      custom_expiry: {
        expiry_duration: 15,
        unit: 'minute'
      }
    }),
    cache: 'no-store'
  });

  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  const statusCode = String(payload.status_code ?? '');
  if (!response.ok || (statusCode !== '201' && statusCode !== '200')) {
    const message = typeof payload.status_message === 'string' ? payload.status_message : `Midtrans HTTP ${response.status}`;
    throw new Error(`midtrans_charge_failed:${message}`);
  }

  const actions = Array.isArray(payload.actions) ? (payload.actions as Array<Record<string, unknown>>) : [];
  const qrAction = actions.find(action =>
    typeof action?.url === 'string' &&
    (action.name === 'generate-qr-code' || action.name === 'generate-qr-code-v2')
  );
  const rawQrUrl = typeof qrAction?.url === 'string' ? qrAction.url : null;
  const qrUrl = rawQrUrl && isAllowedMidtransQrUrl(rawQrUrl) ? rawQrUrl : null;
  const qrString = typeof payload.qr_string === 'string' && payload.qr_string.trim() ? payload.qr_string.trim() : null;

  if (!qrUrl && !qrString) {
    throw new Error('midtrans_missing_qr');
  }

  return {
    orderId: params.orderId,
    transactionId: typeof payload.transaction_id === 'string' ? payload.transaction_id : params.orderId,
    qrUrl,
    qrString,
    expiresAt: parseMidtransExpiry(payload.expiry_time)
  };
}

export async function fetchMidtransTransactionStatus(orderId: string): Promise<{
  transactionStatus: string;
  fraudStatus: string | null;
  grossAmount: number | null;
  transactionId: string | null;
} | null> {
  const serverKey = getMidtransServerKey();
  if (!serverKey) return null;
  const baseUrl = getMidtransBaseUrl(serverKey);

  const response = await fetch(`${baseUrl}/v2/${encodeURIComponent(orderId)}/status`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: authHeader(serverKey)
    },
    cache: 'no-store'
  });
  if (!response.ok) return null;
  const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!payload || typeof payload.transaction_status !== 'string') return null;

  const parsedAmount = Number(payload.gross_amount);
  return {
    transactionStatus: payload.transaction_status,
    fraudStatus: typeof payload.fraud_status === 'string' ? payload.fraud_status : null,
    grossAmount: Number.isFinite(parsedAmount) ? Math.round(parsedAmount) : null,
    transactionId: typeof payload.transaction_id === 'string' ? payload.transaction_id : null
  };
}

export async function applyAppointmentPaymentTransition(
  supabase: SupabaseClient,
  appointment: {
    id: string;
    status: string;
    payment_status: string;
    paid_at?: string | null;
  },
  transition: MidtransTransition,
  transactionId?: string | null
): Promise<{ status: string; paymentStatus: PaymentStatus; paidAt: string | null }> {
  // Never downgrade an already-paid booking unless explicitly refunded.
  if (appointment.payment_status === 'paid' && transition.paymentStatus !== 'refunded' && transition.paymentStatus !== 'paid') {
    return {
      status: appointment.status,
      paymentStatus: 'paid',
      paidAt: appointment.paid_at ?? null
    };
  }

  const nowIso = new Date().toISOString();
  const txPatch = transactionId ? { midtrans_transaction_id: transactionId } : {};

  if (transition.paymentStatus === 'paid') {
    const paidAt = appointment.paid_at ?? nowIso;
    const nextStatus = appointment.status === 'pending' ? 'confirmed' : appointment.status;
    const { data, error } = await supabase
      .from('appointments')
      .update({
        payment_status: 'paid',
        paid_at: paidAt,
        status: nextStatus,
        ...txPatch
      })
      .eq('id', appointment.id)
      .select('status,payment_status,paid_at')
      .maybeSingle();

    if (!error && data) {
      return {
        status: data.status,
        paymentStatus: data.payment_status as PaymentStatus,
        paidAt: data.paid_at
      };
    }

    // If the 30-minute hold already lapsed and another booking claimed the slot,
    // still persist the verified payment so the shop has an accurate record.
    const { data: fallback } = await supabase
      .from('appointments')
      .update({
        payment_status: 'paid',
        paid_at: paidAt,
        ...txPatch
      })
      .eq('id', appointment.id)
      .select('status,payment_status,paid_at')
      .maybeSingle();

    return {
      status: fallback?.status ?? appointment.status,
      paymentStatus: 'paid',
      paidAt: fallback?.paid_at ?? paidAt
    };
  }

  if (transition.autoCancelPendingHold && appointment.status === 'pending') {
    const { data } = await supabase
      .from('appointments')
      .update({
        payment_status: transition.paymentStatus,
        status: 'cancelled',
        cancellation_reason: 'Pembayaran QRIS kedaluwarsa atau dibatalkan.',
        cancelled_at: nowIso,
        ...txPatch
      })
      .eq('id', appointment.id)
      .select('status,payment_status,paid_at')
      .maybeSingle();

    return {
      status: data?.status ?? 'cancelled',
      paymentStatus: transition.paymentStatus,
      paidAt: data?.paid_at ?? null
    };
  }

  const { data } = await supabase
    .from('appointments')
    .update({
      payment_status: transition.paymentStatus,
      ...txPatch
    })
    .eq('id', appointment.id)
    .select('status,payment_status,paid_at')
    .maybeSingle();

  return {
    status: data?.status ?? appointment.status,
    paymentStatus: (data?.payment_status as PaymentStatus) ?? transition.paymentStatus,
    paidAt: data?.paid_at ?? null
  };
}
