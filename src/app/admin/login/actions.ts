'use server';

import { redirect } from 'next/navigation';
import { adminLoginEmail, adminLoginInputSchema } from '@/lib/admin-login';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function signInAction(formData: FormData) {
  const parsed = adminLoginInputSchema.safeParse({ username: formData.get('username'), password: formData.get('password') });
  if (!parsed.success) redirect('/admin/login?error=invalid');
  const email = adminLoginEmail(parsed.data.username);
  if (!email) redirect('/admin/login?error=invalid');
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect('/admin/login?error=setup');
  const { error } = await supabase.auth.signInWithPassword({ email, password: parsed.data.password });
  if (error) redirect('/admin/login?error=credentials');
  redirect('/admin');
}
