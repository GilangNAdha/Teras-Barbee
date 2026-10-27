import { createHmac } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { bookingInputSchema } from '@/lib/validation/booking';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

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

  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const clientAddress = request.headers.get('x-real-ip') || forwarded || 'unknown-client';
  const clientHash = createHmac('sha256', secret).update(clientAddress).digest('hex');
  const { data, error } = await supabase.rpc('create_public_booking', {
    p_service_id: parsed.data.serviceId,
    p_barber_id: parsed.data.barberId ?? null,
    p_starts_at: parsed.data.startsAt,
    p_customer_name: parsed.data.customerName,
    p_customer_phone: parsed.data.customerPhone,
    p_notes: parsed.data.notes || null,
    p_client_hash: clientHash
  });
  if (error || !data?.[0]) {
    const message = error?.message ?? '';
    if (message.includes('booking_slot_taken')) return NextResponse.json({ error: 'That slot was just taken. Pick another time.' }, { status: 409 });
    if (message.includes('booking_rate_limited')) return NextResponse.json({ error: 'Too many booking attempts. Please wait a few minutes and try again.' }, { status: 429 });
    if (message.includes('service_unavailable')) return NextResponse.json({ error: 'That service is no longer available.' }, { status: 409 });
    if (message.includes('booking_out_of_range') || message.includes('shop_closed')) return NextResponse.json({ error: 'That time is outside the booking window.' }, { status: 400 });
    if (message.includes('shop_not_configured')) return NextResponse.json({ error: 'The shop schedule is not configured yet.' }, { status: 503 });
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
  const whatsappPhone = (barberChannel?.phone_whatsapp || settings?.phone_whatsapp)?.replace(/\D/g, '');
  const localDate = new Intl.DateTimeFormat('en-CA', { timeZone: settings?.timezone || 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(booking.starts_at));
  const localTime = new Intl.DateTimeFormat('en-GB', { timeZone: settings?.timezone || 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(booking.starts_at));
  const recipientText = barberChannel ? `Hi ${booking.barber_name}, I just requested an appointment with you` : `Hi Terasbarber, please route this request to ${booking.barber_name}`;
  const message = `${recipientText}. Code: ${booking.booking_code}. ${booking.service_name} on ${localDate} at ${localTime}. Please confirm.`;
  const whatsappUrl = whatsappPhone ? `https://wa.me/${whatsappPhone}?text=${encodeURIComponent(message)}` : null;

  return NextResponse.json({
    booking: { code: booking.booking_code, service: booking.service_name, barber: booking.barber_name, startsAt: booking.starts_at },
    whatsappUrl,
    whatsappRecipient: barberChannel ? 'barber' : 'shop'
  }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
}
