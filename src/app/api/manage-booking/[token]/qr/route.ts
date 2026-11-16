import { NextRequest, NextResponse } from 'next/server';
import { hashManageToken, manageTokenSchema } from '@/lib/booking-management';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { isAllowedMidtransQrUrl } from '@/lib/midtrans';

const noStore = { 'Cache-Control': 'private, no-store' };

// Proxy the Midtrans-hosted QRIS image through our own origin so CSP, CORS, and
// third-party image hosts can never break the payment screen.
export async function GET(_request: NextRequest, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const valid = manageTokenSchema.safeParse(token);
  if (!valid.success) return NextResponse.json({ error: 'This booking link is invalid, expired, or has been revoked.' }, { status: 404, headers: noStore });
  const hashedToken = hashManageToken(valid.data);
  const supabase = createSupabaseServiceClient();
  if (!supabase) return NextResponse.json({ error: 'Payments are temporarily unavailable.' }, { status: 503, headers: noStore });

  const { data: tokenRow } = await supabase
    .from('appointment_manage_tokens')
    .select('appointment_id,revoked_at,expires_at')
    .eq('token_hash', hashedToken)
    .maybeSingle();
  if (!tokenRow || tokenRow.revoked_at || new Date(tokenRow.expires_at).getTime() <= Date.now()) {
    return NextResponse.json({ error: 'This booking link is invalid, expired, or has been revoked.' }, { status: 404, headers: noStore });
  }

  const { data: appointment } = await supabase
    .from('appointments')
    .select('qris_qr_url,qris_string,payment_method')
    .eq('id', tokenRow.appointment_id)
    .maybeSingle();
  if (!appointment || appointment.payment_method !== 'qris' || !appointment.qris_qr_url || !isAllowedMidtransQrUrl(appointment.qris_qr_url)) {
    return NextResponse.json({ error: 'No QRIS code is available for this booking.' }, { status: 404, headers: noStore });
  }

  const upstream = await fetch(appointment.qris_qr_url, { cache: 'no-store' });
  if (!upstream.ok) {
    console.error('QRIS image fetch failed:', upstream.status);
    return NextResponse.json({ error: 'The QRIS code could not be loaded. Please try again.' }, { status: 502, headers: noStore });
  }
  const buffer = await upstream.arrayBuffer();
  return new NextResponse(buffer, {
    headers: {
      ...noStore,
      'Content-Type': upstream.headers.get('content-type') || 'image/png',
      'Content-Disposition': 'inline',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}
