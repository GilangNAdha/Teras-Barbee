import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const uuidListSchema = z.array(z.uuid()).min(1).max(5).refine(ids => new Set(ids).size === ids.length);
const barberIdSchema = z.uuid();
const dateSchema = z.iso.date();
const noStore = { 'Cache-Control': 'private, no-store' };

function availabilityError(message: string) {
  if (message.includes('service_unavailable')) return NextResponse.json({ error: 'A selected service is no longer available. Please refresh the page.' }, { status: 409, headers: noStore });
  if (message.includes('invalid_duration')) return NextResponse.json({ error: 'Choose services with a total duration of 10 hours or less.' }, { status: 400, headers: noStore });
  if (message.includes('invalid_calendar_range')) return NextResponse.json({ error: 'Choose a valid calendar range.' }, { status: 400, headers: noStore });
  if (message.includes('invalid_barber')) return NextResponse.json({ error: 'Choose a valid kapster.' }, { status: 400, headers: noStore });
  console.error('Availability query failed:', message);
  return NextResponse.json({ error: 'Availability could not be loaded. Please try again.' }, { status: 503, headers: noStore });
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  // Keep the existing serviceId query working for single-service callers.
  const ids = params.get('serviceIds')?.split(',').filter(Boolean) ?? params.getAll('serviceId');
  const rawBarberId = params.get('barberId') || undefined;
  const isCalendar = params.get('view') === 'calendar';
  const date = dateSchema.safeParse(params.get('date'));
  const from = dateSchema.safeParse(params.get('from'));
  const to = dateSchema.safeParse(params.get('to'));
  const includeUnavailable = params.get('includeUnavailable') === '1';

  if (isCalendar ? !from.success || !to.success : !date.success) {
    return NextResponse.json({ error: 'Choose a valid date.' }, { status: 400, headers: noStore });
  }
  if (isCalendar && from.success && to.success) {
    const days = (Date.parse(`${to.data}T00:00:00Z`) - Date.parse(`${from.data}T00:00:00Z`)) / 86_400_000;
    if (days < 0 || days > 41) return NextResponse.json({ error: 'Choose a valid calendar range.' }, { status: 400, headers: noStore });
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: 'Booking is not configured yet.' }, { status: 503, headers: noStore });

  // Kapster-first mode: the Pesan Barber flow picks a barber before services, so
  // availability is derived from the barber's own schedule.
  if (ids.length === 0) {
    const barberId = barberIdSchema.safeParse(rawBarberId);
    if (!barberId.success) return NextResponse.json({ error: 'Choose a kapster and valid date.' }, { status: 400, headers: noStore });
    if (isCalendar && from.success && to.success) {
      const { data, error } = await supabase.rpc('get_barber_schedule_calendar', { p_barber_id: barberId.data, p_from: from.data, p_to: to.data });
      if (error) return availabilityError(error.message);
      return NextResponse.json({ dates: data ?? [] }, { headers: noStore });
    }
    if (!date.success) return NextResponse.json({ error: 'Choose a valid date.' }, { status: 400, headers: noStore });
    const { data, error } = await supabase.rpc('get_barber_schedule_slots', { p_barber_id: barberId.data, p_date: date.data });
    if (error) return availabilityError(error.message);
    const rows = data ?? [];
    const slots = includeUnavailable ? rows : rows.filter(slot => slot.is_available);
    return NextResponse.json({
      slots: slots.map(slot => ({
        starts_at: slot.starts_at,
        barber_id: slot.barber_id,
        barber_name: slot.barber_name,
        is_available: slot.is_available,
        max_duration_minutes: slot.max_duration_minutes
      }))
    }, { headers: noStore });
  }

  const serviceIds = uuidListSchema.safeParse(ids);
  const barberId = rawBarberId ? barberIdSchema.safeParse(rawBarberId) : null;
  if (!serviceIds.success || (barberId && !barberId.success)) {
    return NextResponse.json({ error: 'Choose a service and valid date.' }, { status: 400, headers: noStore });
  }
  if (isCalendar && from.success && to.success) {
    const { data, error } = await supabase.rpc('get_booking_calendar', {
      p_from: from.data, p_to: to.data, p_service_ids: serviceIds.data, p_barber_id: barberId?.success ? barberId.data : null
    });
    if (error) return availabilityError(error.message);
    return NextResponse.json({ dates: data ?? [] }, { headers: noStore });
  }
  if (!date.success) return NextResponse.json({ error: 'Choose a service and valid date.' }, { status: 400, headers: noStore });
  const { data, error } = await supabase.rpc('get_booking_slots', {
    p_date: date.data, p_service_ids: serviceIds.data, p_barber_id: barberId?.success ? barberId.data : null
  });
  if (error) return availabilityError(error.message);
  // Existing callers receive only available slots; the booking calendar requests
  // unavailable slots as well so they can be displayed as disabled.
  const slots = includeUnavailable ? data ?? [] : (data ?? []).filter(slot => slot.is_available);
  return NextResponse.json({ slots }, { headers: noStore });
}
