import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const selectionSchema = z.object({
  serviceIds: z.array(z.uuid()).min(1).max(5).refine(ids => new Set(ids).size === ids.length),
  barberId: z.uuid().optional()
});
const dateSchema = z.iso.date();
const noStore = { 'Cache-Control': 'private, no-store' };

function availabilityError(message: string) {
  if (message.includes('service_unavailable')) return NextResponse.json({ error: 'A selected service is no longer available. Please refresh the page.' }, { status: 409, headers: noStore });
  if (message.includes('invalid_duration')) return NextResponse.json({ error: 'Choose services with a total duration of 10 hours or less.' }, { status: 400, headers: noStore });
  console.error('Availability query failed:', message);
  return NextResponse.json({ error: 'Availability could not be loaded. Please try again.' }, { status: 503, headers: noStore });
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  // Keep the existing serviceId query working for single-service callers.
  const ids = params.get('serviceIds')?.split(',').filter(Boolean) ?? params.getAll('serviceId');
  const selection = selectionSchema.safeParse({ serviceIds: ids, barberId: params.get('barberId') || undefined });
  const isCalendar = params.get('view') === 'calendar';
  const date = dateSchema.safeParse(params.get('date'));
  const from = dateSchema.safeParse(params.get('from'));
  const to = dateSchema.safeParse(params.get('to'));
  if (!selection.success || (isCalendar ? !from.success || !to.success : !date.success)) {
    return NextResponse.json({ error: 'Choose a service and valid date.' }, { status: 400, headers: noStore });
  }
  if (isCalendar && from.success && to.success) {
    const days = (Date.parse(`${to.data}T00:00:00Z`) - Date.parse(`${from.data}T00:00:00Z`)) / 86_400_000;
    if (days < 0 || days > 41) return NextResponse.json({ error: 'Choose a valid calendar range.' }, { status: 400, headers: noStore });
  }
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: 'Booking is not configured yet.' }, { status: 503, headers: noStore });
  if (isCalendar && from.success && to.success) {
    const { data, error } = await supabase.rpc('get_booking_calendar', {
      p_from: from.data, p_to: to.data, p_service_ids: selection.data.serviceIds, p_barber_id: selection.data.barberId ?? null
    });
    if (error) return availabilityError(error.message);
    return NextResponse.json({ dates: data ?? [] }, { headers: noStore });
  }
  if (!date.success) return NextResponse.json({ error: 'Choose a service and valid date.' }, { status: 400, headers: noStore });
  const { data, error } = await supabase.rpc('get_booking_slots', {
    p_date: date.data, p_service_ids: selection.data.serviceIds, p_barber_id: selection.data.barberId ?? null
  });
  if (error) return availabilityError(error.message);
  // Existing callers receive only available slots; the booking calendar requests
  // unavailable slots as well so they can be displayed as disabled.
  const slots = params.get('includeUnavailable') === '1' ? data ?? [] : (data ?? []).filter(slot => slot.is_available);
  return NextResponse.json({ slots }, { headers: noStore });
}
