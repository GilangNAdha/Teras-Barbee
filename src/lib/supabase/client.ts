'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/lib/database.types';

let browserClient: ReturnType<typeof createBrowserClient<Database>> | null = null;

// Publishable keys (sb_publishable_...) are the current Supabase convention;
// the legacy NEXT_PUBLIC_SUPABASE_ANON_KEY name stays supported.
function resolveKey() {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    null
  );
}

export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = resolveKey();
  if (!url || !key) return null;
  browserClient ??= createBrowserClient<Database>(url, key);
  return browserClient;
}
