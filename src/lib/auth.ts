import 'server-only';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function requireAdmin(options: { skipMfaCheck?: boolean } = {}) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect('/admin/login?error=setup');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/admin/login');
  const { data: profile } = await supabase.from('profiles').select('role,full_name').eq('id', user.id).maybeSingle();
  if (profile?.role !== 'admin') redirect('/admin/login?error=unauthorized');
  if (!options.skipMfaCheck) {
    const { data: assurance } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assurance?.nextLevel === 'aal2' && assurance.currentLevel !== 'aal2') redirect('/admin/security?verify=1');
  }
  return { supabase, user, profile };
}
