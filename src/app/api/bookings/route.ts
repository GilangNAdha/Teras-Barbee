import { createHmac, randomUUID } from 'node:crypto';
import { hashManageToken, normalizeIndonesianPhone } from '@/lib/booking-management';
import { NextRequest, NextResponse } from 'next/server';
import { bookingInputSchema } from '@/lib/validation/booking';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { chargeMidtransQris, isMidtransConfigured } from '@/lib/midtrans';

const noStore = { 'Cache-Control': 'no-store' };

export async function POST(request: NextRequest) {
  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 }); }
  const parsed = bookingInputSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Check the booking details and try again.', fields: parsed.error.flatten().fieldErrors }, { status: 400 });
  const secret = process.env.BOOKING_HASH_SECRET;
  if (!secret || secret.length < 32) return NextResponse.json({ error: 'Bookings are not fully configured. Please contact the shop.' }, { status: 503 });
  const supabase = createSupabaseServiceClient();
  if (!supabase) return NextResponse.json({ error: 'Online booking is not configured yet.' }, { status: 503 });

  // Without a Midtrans key the shop cannot issue a real QRIS charge, so fall back
  // to paying in the shop instead of creating an unpayable pending booking.
  let paymentMethod = parsed.data.paymentMethod;
  let paymentFallback = false;
  if (paymentMethod === 'qris' && !isMidtransConfigured()) {
    paymentMethod = 'pay_at_barber';
    paymentFallback = true;
  }

  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const clientAddress = request.headers.get('x-real-ip') || forwarded || 'unknown-client';
  const clientHash = createHmac('sha256', secret).update(clientAddress).digest('hex');
  // Derive the private management capability from a random request id so a retry
  // after a lost response can safely return the same booking and management link.
  const requestId = parsed.data.requestId ?? randomUUID();
  const manageToken = createHmac('sha256', secret).update(`booking-manage:${requestId}`).digest('base64url');
  const { data, error } = await supabase.rpc('create_booking_request', {
    p_service_ids: parsed.data.serviceIds,
    p_barber_id: parsed.data.barberId ?? null,
    p_starts_at: parsed.data.startsAt,
    p_customer_name: parsed.data.customerName,
    p_customer_phone: normalizeIndonesianPhone(parsed.data.customerPhone),
    p_notes: parsed.data.notes || null,
    p_client_hash: clientHash,
    p_manage_token_hash: hashManageToken(manageToken),
    p_request_id: requestId,
    p_expected_price: parsed.data.expectedPrice ?? null,
    p_expected_duration: parsed.data.expectedDuration ?? null,
    p_payment_method: paymentMethod
  });
  if (error || !data?.[0]) {
    const message = error?.message ?? '';
    if (message.includes('booking_slot_taken')) return NextResponse.json({ error: 'That slot was just taken. Pick another time.' }, { status: 409 });
    if (message.includes('booking_rate_limited')) return NextResponse.json({ error: 'Too many booking attempts. Please wait a few minutes and try again.' }, { status: 429 });
    if (message.includes('service_unavailable')) return NextResponse.json({ error: 'A selected service is no longer available. Please refresh the page.' }, { status: 409 });
    if (message.includes('service_details_changed')) return NextResponse.json({ error: 'Service prices or durations have changed. Please refresh the page before booking.' }, { status: 409 });
    if (message.includes('services_too_long') || message.includes('invalid_service_selection')) return NextResponse.json({ error: 'Please choose up to five services with a total duration of 10 hours or less.' }, { status: 400 });
    if (message.includes('booking_out_of_range') || message.includes('shop_closed')) return NextResponse.json({ error: 'That time is outside the booking window.' }, { status: 400 });
    if (message.includes('shop_not_configured')) return NextResponse.json({ error: 'The shop schedule is not configured yet.' }, { status: 503 });
    if (message.includes('invalid_payment_method')) return NextResponse.json({ error: 'Choose a valid payment method.' }, { status: 400 });
    console.error('Booking RPC failed:', message);
    return NextResponse.json({ error: 'We could not save this booking. Please try again.' }, { status: 503 });
  }

  const booking = data[0];
  const [{ data: settings }, { data: appointment }] = await Promise.all([
    supabase.from('shop_settings').select('phone_whatsapp,timezone').eq('id', 1).maybeSingle(),
    supabase.from('appointments').select('barber_id').eq('id', booking.appointment_id).maybeSingle()
  ]);
  const { data: barberChannel } = appointment?.barber_id
    ? await supabase.from('barber_contact_channels').select('phone_whatsapp').eq('barber_id', appointment.barber_id).maybeSingle()
    : { data: null };
  const timezone = settings?.timezone || 'Asia/Jakarta';

  let payment: {
    method: 'qris' | 'pay_at_barber';
    status: string;
    qrUrl: string | null;
    qrImageUrl: string | null;
    expiresAt: string | null;
    fallback: boolean;
    error: string | null;
  } = {
    method: booking.payment_method ?? paymentMethod,
    status: booking.payment_status ?? (paymentMethod === 'qris' ? 'pending' : 'unpaid'),
    qrUrl: null,
    qrImageUrl: null,
    expiresAt: null,
    fallback: paymentFallback,
    error: null
  };

  if (payment.method === 'qris') {
    const orderId = `TB-${booking.booking_code}-${booking.appointment_id.slice(0, 8)}`;
    try {
      const charge = await chargeMidtransQris({
        orderId,
        grossAmount: booking.price_idr,
        customerName: parsed.data.customerName,
        customerPhone: normalizeIndonesianPhone(parsed.data.customerPhone),
        serviceSummary: booking.service_name
      });
      const { error: persistError } = await supabase.from('appointments').update({
        midtrans_order_id: charge.orderId,
        midtrans_transaction_id: charge.transactionId,
        qris_qr_url: charge.qrUrl,
        qris_string: charge.qrString,
        qris_expires_at: charge.expiresAt,
        payment_status: 'pending'
      }).eq('id', booking.appointment_id);
      if (persistError) console.error('QRIS persistence failed:', persistError.message);
      payment = {
        ...payment,
        status: 'pending',
        qrUrl: charge.qrUrl,
        qrImageUrl: `/api/manage-booking/${manageToken}/qr`,
        expiresAt: charge.expiresAt
      };
    } catch (chargeError) {
      // The slot is already held, so surface the failure and let the customer pay
      // at the shop rather than losing the booking entirely.
      console.error('Midtrans QRIS charge failed:', chargeError instanceof Error ? chargeError.message : chargeError);
      await supabase.from('appointments').update({ payment_method: 'pay_at_barber', payment_status: 'unpaid' }).eq('id', booking.appointment_id);
      payment = { ...payment, method: 'pay_at_barber', status: 'unpaid', fallback: true, error: 'QRIS sedang tidak tersedia. Silakan bayar di barbershop.' };
    }
  }

  const whatsappPhone = (barberChannel?.phone_whatsapp || settings?.phone_whatsapp)?.replace(/\D/g, '');
  const localDate = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(booking.starts_at));
  const localTime = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(booking.starts_at));
  const recipientText = barberChannel ? `Halo ${booking.barber_name}, saya baru saja memesan jadwal` : `Halo Terasbarber, mohon diteruskan ke ${booking.barber_name}`;
  const message = `${recipientText}. Kode: ${booking.booking_code}. ${booking.service_name} pada ${localDate} pukul ${localTime}. Mohon konfirmasinya.`;
  const whatsappUrl = whatsappPhone ? `https://wa.me/${whatsappPhone}?text=${encodeURIComponent(message)}` : null;

  return NextResponse.json({
    booking: { code: booking.booking_code, service: booking.service_name, barber: booking.barber_name, startsAt: booking.starts_at, price: booking.price_idr, duration: booking.duration_minutes, status: booking.booking_status },
    payment,
    manageUrl: `/manage-booking/${manageToken}`,
    whatsappUrl,
    whatsappRecipient: barberChannel ? 'barber' : 'shop'
  }, { status: 201, headers: noStore });
}
