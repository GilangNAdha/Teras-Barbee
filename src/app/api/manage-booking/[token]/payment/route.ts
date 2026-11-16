import { NextRequest, NextResponse } from 'next/server';
import { hashManageToken, manageTokenSchema } from '@/lib/booking-management';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import {
  applyAppointmentPaymentTransition,
  fetchMidtransTransactionStatus,
  mapMidtransPaymentState
} from '@/lib/midtrans';

const noStore = { 'Cache-Control': 'private, no-store' };

async function resolveToken(params: Promise<{ token: string }>) {
  const { token } = await params;
  const valid = manageTokenSchema.safeParse(token);
  return valid.success ? hashManageToken(valid.data) : null;
}

// Live payment status for the QRIS countdown/polling UI. When a QRIS payment is
// still pending the route asks Midtrans for the authoritative status, which also
// covers webhooks that have not been delivered yet.
export async function GET(_request: NextRequest, context: { params: Promise<{ token: string }> }) {
  const hashedToken = await resolveToken(context.params);
  if (!hashedToken) return NextResponse.json({ error: 'This booking link is invalid, expired, or has been revoked.' }, { status: 404, headers: noStore });
  const supabase = createSupabaseServiceClient();
  if (!supabase) return NextResponse.json({ error: 'Booking management is temporarily unavailable.' }, { status: 503, headers: noStore });

  const { data: tokenRow, error: tokenError } = await supabase
    .from('appointment_manage_tokens')
    .select('appointment_id,revoked_at,expires_at')
    .eq('token_hash', hashedToken)
    .maybeSingle();
  if (tokenError) {
    console.error('Payment status token lookup failed:', tokenError.message);
    return NextResponse.json({ error: 'Payment status could not be loaded.' }, { status: 503, headers: noStore });
  }
  if (!tokenRow || tokenRow.revoked_at || new Date(tokenRow.expires_at).getTime() <= Date.now()) {
    return NextResponse.json({ error: 'This booking link is invalid, expired, or has been revoked.' }, { status: 404, headers: noStore });
  }

  const { data: appointment, error } = await supabase
    .from('appointments')
    .select('id,status,payment_method,payment_status,midtrans_order_id,qris_expires_at,paid_at,price_idr_snapshot')
    .eq('id', tokenRow.appointment_id)
    .maybeSingle();
  if (error || !appointment) {
    if (error) console.error('Payment status query failed:', error.message);
    return NextResponse.json({ error: 'Payment status could not be loaded.' }, { status: 503, headers: noStore });
  }

  let paymentStatus: string = appointment.payment_status;
  let bookingStatus: string = appointment.status;
  let paidAt = appointment.paid_at;

  if (appointment.payment_method === 'qris' && paymentStatus === 'pending' && appointment.midtrans_order_id) {
    const remote = await fetchMidtransTransactionStatus(appointment.midtrans_order_id);
    if (remote && (remote.grossAmount === null || remote.grossAmount === appointment.price_idr_snapshot)) {
      const transition = mapMidtransPaymentState(remote.transactionStatus, remote.fraudStatus);
      if (transition.paymentStatus !== 'pending') {
        const result = await applyAppointmentPaymentTransition(supabase, {
          id: appointment.id,
          status: appointment.status,
          payment_status: appointment.payment_status,
          paid_at: appointment.paid_at
        }, transition, remote.transactionId);
        paymentStatus = result.paymentStatus;
        bookingStatus = result.status;
        paidAt = result.paidAt;
      }
    }
  }

  return NextResponse.json({
    payment: {
      method: appointment.payment_method,
      status: paymentStatus,
      bookingStatus,
      paidAt,
      expiresAt: appointment.qris_expires_at
    },
    qrAvailable: Boolean(appointment.payment_method === 'qris' && appointment.midtrans_order_id)
  }, { headers: noStore });
}
