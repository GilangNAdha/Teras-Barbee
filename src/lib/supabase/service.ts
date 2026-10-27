import 'server-only';

import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { getSecretKey, getSupabaseUrl } from '@/lib/env';

// Service-role / secret key: server-only. Never import this module from a Client
// Component and never expose its key with a NEXT_PUBLIC_ prefix.
export function createSupabaseServiceClient() {
  const url = getSupabaseUrl();
  const serviceKey = getSecretKey();
  if (!url || !serviceKey) return null;
  return createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
}
