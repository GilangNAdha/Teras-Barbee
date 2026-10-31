import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { hashManageToken, manageTokenSchema } from '@/lib/booking-management';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

const noStore = { 'Cache-Control': 'private, no-store' };

export async function GET(request: NextRequest, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const validToken = manageTokenSchema.safeParse(token);
  const date = z.iso.date().safeParse(request.nextUrl.searchParams.get('date'));
  if (!validToken.success || !date.success) return NextResponse.json({ error: 'Choose a valid date and booking link.' }, { status: 400, headers: noStore });
  const supabase = createSupabaseServiceClient();
  if (!supabase) return NextResponse.json({ error: 'Booking management is temporarily unavailable.' }, { status: 503, headers: noStore });
  const { data, error } = await supabase.rpc('get_managed_booking_slots', { p_token_hash: hashManageToken(validToken.data), p_date: date.data });
  if (error) {
    if (error.message.includes('manage_token_invalid')) return NextResponse.json({ error: 'This booking link is invalid, expired, or has been revoked.' }, { status: 404, headers: noStore });
    if (error.message.includes('service_unavailable')) return NextResponse.json({ error: 'This appointment can no longer be rescheduled online. Please contact the shop.' }, { status: 409, headers: noStore });
    console.error('Managed availability query failed:', error.message);
    return NextResponse.json({ error: 'Availability could not be loaded. Please try again.' }, { status: 503, headers: noStore });
  }
  return NextResponse.json({ slots: (data ?? []).filter(slot => slot.is_available) }, { headers: noStore });
}
