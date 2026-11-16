import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import {
  applyAppointmentPaymentTransition,
  mapMidtransPaymentState,
  verifyMidtransSignature
} from '@/lib/midtrans';

const noStore = { 'Cache-Control': 'no-store' };

type NotificationBody = {
  order_id?: unknown;
  status_code?: unknown;
  gross_amount?: unknown;
  signature_key?: unknown;
  transaction_status?: unknown;
  fraud_status?: unknown;
  transaction_id?: unknown;
  payment_type?: unknown;
};

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

// Midtrans sends its payment notification here. Signature verification uses the
// shared server key, so an unauthenticated caller cannot mark a booking as paid.
export async function POST(request: NextRequest) {
  const serverKey = process.env.MIDTRANS_SERVER_KEY?.trim();
  if (!serverKey) {
    console.error('Midtrans notification received but MIDTRANS_SERVER_KEY is not configured.');
    return NextResponse.json({ error: 'Payment notifications are not configured.' }, { status: 503, headers: noStore });
  }

  let payload: NotificationBody;
  try { payload = await request.json() as NotificationBody; }
  catch { return NextResponse.json({ error: 'Invalid notification body.' }, { status: 400, headers: noStore }); }

  const orderId = text(payload.order_id);
  const statusCode = text(payload.status_code);
  const grossAmount = text(payload.gross_amount);
  const signatureKey = text(payload.signature_key);
  const transactionStatus = text(payload.transaction_status);
  const transactionId = text(payload.transaction_id);
  if (!orderId || !statusCode || !grossAmount || !signatureKey || !transactionStatus) {
    return NextResponse.json({ error: 'Incomplete notification body.' }, { status: 400, headers: noStore });
  }

  if (!verifyMidtransSignature({ orderId, statusCode, grossAmount, signatureKey, serverKey })) {
    console.warn('Midtrans notification rejected: invalid signature for order', orderId);
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 401, headers: noStore });
  }

  const supabase = createSupabaseServiceClient();
  if (!supabase) return NextResponse.json({ error: 'Payment notifications are not configured.' }, { status: 503, headers: noStore });

  const { data: appointment, error: lookupError } = await supabase
    .from('appointments')
    .select('id,status,payment_status,paid_at,price_idr_snapshot,midtrans_order_id')
    .eq('midtrans_order_id', orderId)
    .maybeSingle();

  if (lookupError) {
    console.error('Midtrans notification lookup failed:', lookupError.message);
    return NextResponse.json({ error: 'Could not read the booking.' }, { status: 503, headers: noStore });
  }
  if (!appointment) {
    // Acknowledge unknown orders so Midtrans stops retrying an unrelated charge.
    console.warn('Midtrans notification for unknown order', orderId);
    return NextResponse.json({ received: true, ignored: 'unknown_order' }, { headers: noStore });
  }

  const amountMatches = Number(grossAmount) === appointment.price_idr_snapshot;
  if (!amountMatches && transactionStatus.toLowerCase() !== 'expire') {
    console.warn('Midtrans notification amount mismatch for order', orderId, grossAmount, appointment.price_idr_snapshot);
    return NextResponse.json({ error: 'Amount mismatch.' }, { status: 409, headers: noStore });
  }

  const transition = mapMidtransPaymentState(transactionStatus, text(payload.fraud_status) || null);
  const result = await applyAppointmentPaymentTransition(supabase, {
    id: appointment.id,
    status: appointment.status,
    payment_status: appointment.payment_status,
    paid_at: appointment.paid_at
  }, transition, transactionId || null);

  return NextResponse.json({
    received: true,
    orderId,
    bookingStatus: result.status,
    paymentStatus: result.paymentStatus
  }, { headers: noStore });
}
