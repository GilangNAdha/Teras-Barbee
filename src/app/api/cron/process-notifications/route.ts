import { NextRequest, NextResponse } from 'next/server';
import { getCronSecret } from '@/lib/env';
import { isAuthorizedCronRequest } from '@/lib/notifications/cron-auth';
import {
  createSupabaseNotificationGateway,
  processNotificationJobs
} from '@/lib/notifications/worker';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const noStore = { 'Cache-Control': 'no-store' };

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
    const summary = await processNotificationJobs({
      gateway: createSupabaseNotificationGateway(supabase)
    });
    // Counts and ids only — never recipients or message content.
    return NextResponse.json({ ok: true, ...summary }, { headers: noStore });
  } catch (error) {
    console.error('notification worker failed:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Notification processing failed.' }, { status: 500, headers: noStore });
  }
}
