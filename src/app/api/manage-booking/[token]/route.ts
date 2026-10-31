import { NextRequest, NextResponse } from 'next/server';
import { readJsonRequest } from '@/lib/request-json';
import { hashManageToken, manageBookingRequestSchema, manageTokenSchema } from '@/lib/booking-management';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

const noStore = { 'Cache-Control': 'private, no-store' };

function problemResponse(message: string) {
  if (message.includes('manage_token_invalid')) return NextResponse.json({ error: 'This booking link is invalid, expired, or has been revoked.' }, { status: 404, headers: noStore });
  if (message.includes('cancel_deadline_passed')) return NextResponse.json({ error: 'The cancellation deadline has passed. Please contact the shop.' }, { status: 409, headers: noStore });
  if (message.includes('reschedule_deadline_passed')) return NextResponse.json({ error: 'The rescheduling deadline has passed. Please contact the shop.' }, { status: 409, headers: noStore });
  if (message.includes('booking_not_manageable')) return NextResponse.json({ error: 'This booking can no longer be changed.' }, { status: 409, headers: noStore });
  if (message.includes('booking_slot_taken') || message.includes('slot_unavailable') || message.includes('shop_closed')) return NextResponse.json({ error: 'That time is no longer available. Choose another slot.' }, { status: 409, headers: noStore });
  if (message.includes('booking_out_of_range')) return NextResponse.json({ error: 'Choose a time inside the shop booking window.' }, { status: 400, headers: noStore });
  if (message.includes('service_unavailable') || message.includes('barber_unavailable')) return NextResponse.json({ error: 'This appointment can no longer be rescheduled online. Please contact the shop.' }, { status: 409, headers: noStore });
  console.error('Booking management RPC failed:', message);
  return NextResponse.json({ error: 'Booking details could not be updated. Please try again.' }, { status: 503, headers: noStore });
}

async function tokenHash(params: Promise<{ token: string }>) {
  const { token } = await params;
  const valid = manageTokenSchema.safeParse(token);
  return valid.success ? hashManageToken(valid.data) : null;
}

export async function GET(_request: NextRequest, context: { params: Promise<{ token: string }> }) {
  const hashedToken = await tokenHash(context.params);
  if (!hashedToken) return problemResponse('manage_token_invalid');
  const supabase = createSupabaseServiceClient();
  if (!supabase) return NextResponse.json({ error: 'Booking management is temporarily unavailable.' }, { status: 503, headers: noStore });
  const { data, error } = await supabase.rpc('manage_public_booking', {
    p_token_hash: hashedToken, p_action: 'view', p_new_starts_at: null, p_cancellation_reason: null
  });
  if (error) return problemResponse(error.message);
  if (!data?.[0]) return problemResponse('manage_token_invalid');
  return NextResponse.json({ booking: data[0] }, { headers: noStore });
}

export async function POST(request: NextRequest, context: { params: Promise<{ token: string }> }) {
  const hashedToken = await tokenHash(context.params);
  if (!hashedToken) return problemResponse('manage_token_invalid');
  const input = await readJsonRequest(request, noStore);
  if (input.error) return input.error;
  const parsed = manageBookingRequestSchema.safeParse(input.body);
  if (!parsed.success) return NextResponse.json({ error: 'Choose a valid cancellation or reschedule action.' }, { status: 400, headers: noStore });
  const supabase = createSupabaseServiceClient();
  if (!supabase) return NextResponse.json({ error: 'Booking management is temporarily unavailable.' }, { status: 503, headers: noStore });
  const { data, error } = await supabase.rpc('manage_public_booking', {
    p_token_hash: hashedToken,
    p_action: parsed.data.action,
    p_new_starts_at: parsed.data.action === 'reschedule' ? parsed.data.startsAt : null,
    p_cancellation_reason: parsed.data.action === 'cancel' ? parsed.data.reason : null
  });
  if (error) return problemResponse(error.message);
  if (!data?.[0]) return problemResponse('manage_token_invalid');
  return NextResponse.json({ booking: data[0] }, { headers: noStore });
}
