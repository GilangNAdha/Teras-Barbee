import { NextRequest, NextResponse } from 'next/server';
import { getCronSecret } from '@/lib/env';
import { isAuthorizedCronRequest } from '@/lib/notifications/cron-auth';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const noStore = { 'Cache-Control': 'no-store' };

// Hourly maintenance: enqueue upcoming appointment reminders and release
// pending bookings that were never confirmed. Both RPCs are idempotent.
export async function GET(request: NextRequest) {
  if (!getCronSecret()) {
    return NextResponse.json({ error: 'CRON_SECRET is not configured.' }, { status: 503, headers: noStore });
  }
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized scheduled invocation.' }, { status: 401, headers: noStore });
  }

  const supabase = createSupabaseServiceClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Database is not configured.' }, { status: 503, headers: noStore });
  }

  try {
    const [reminders, expired] = await Promise.all([
      supabase.rpc('enqueue_appointment_reminders'),
      supabase.rpc('expire_stale_pending_bookings', { p_max_age: '30 minutes' })
    ]);

    if (reminders.error) {
      console.error('reminder enqueue failed:', reminders.error.message);
      return NextResponse.json({ error: 'Reminder enqueue failed.' }, { status: 500, headers: noStore });
    }
    if (expired.error) {
      console.error('pending expiry failed:', expired.error.message);
      return NextResponse.json({ error: 'Pending expiry failed.' }, { status: 500, headers: noStore });
    }

    return NextResponse.json(
      { ok: true, remindersEnqueued: reminders.data ?? 0, pendingExpired: expired.data ?? 0 },
      { headers: noStore }
    );
  } catch (error) {
    console.error('maintenance cron failed:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Maintenance failed.' }, { status: 500, headers: noStore });
  }
}
