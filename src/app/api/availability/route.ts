import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const querySchema = z.object({ date: z.iso.date(), serviceId: z.uuid(), barberId: z.uuid().optional() });

export async function GET(request: NextRequest) {
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ error: 'Choose a service and valid date.' }, { status: 400 });
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: 'Booking is not configured yet.' }, { status: 503 });
  const { data, error } = await supabase.rpc('get_public_availability', {
    p_date: parsed.data.date,
    p_service_id: parsed.data.serviceId,
    p_barber_id: parsed.data.barberId ?? null
  });
  if (error) {
    console.error('Availability query failed:', error.message);
    return NextResponse.json({ error: 'Availability could not be loaded. Please try again.' }, { status: 503 });
  }
  return NextResponse.json({ slots: data ?? [] }, { headers: { 'Cache-Control': 'private, no-store' } });
}
