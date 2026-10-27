import 'server-only';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@/lib/database.types';
import { getPublishableKey, getSupabaseUrl, hasSupabaseConfig } from '@/lib/env';

export { hasSupabaseConfig };

export async function createSupabaseServerClient() {
  const url = getSupabaseUrl();
  const key = getPublishableKey();
  if (!url || !key) return null;

  const cookieStore = await cookies();
  return createServerClient<Database>(url, key, {
    cookies: {
      getAll() { return cookieStore.getAll(); },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Components cannot mutate cookies; proxy.ts refreshes the session.
        }
      }
    }
  });
}
