import { NextResponse } from 'next/server';
import { getBookingTimezone, hasServiceConfig, hasSupabaseConfig } from '@/lib/env';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

export const dynamic = 'force-dynamic';

const noStore = { 'Cache-Control': 'no-store' };

// Lightweight readiness probe for Vercel/uptime monitors. It never exposes
// credentials, DSNs or customer data — only service status and configuration
// booleans so operators can distinguish "not configured" from "database down".
export async function GET() {
  const body = {
    status: 'ok',
    timezone: getBookingTimezone(),
    supabaseConfigured: hasSupabaseConfig(),
    serviceRoleConfigured: hasServiceConfig(),
    database: 'unknown',
    checkedAt: new Date().toISOString()
  };

  const supabase = createSupabaseServiceClient();
  if (!supabase) {
    return NextResponse.json(
      { ...body, status: 'degraded', database: 'not_configured' },
      { status: 503, headers: noStore }
    );
  }

  const { error } = await supabase.from('shop_settings').select('id').eq('id', 1).maybeSingle();
  if (error) {
    console.error('health check database query failed:', error.message);
    return NextResponse.json(
      { ...body, status: 'unhealthy', database: 'error' },
      { status: 503, headers: noStore }
    );
  }

  return NextResponse.json({ ...body, database: 'ok' }, { headers: noStore });
}
