'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const schema = z.object({ email: z.email().max(254), password: z.string().min(8).max(128) });

export async function signInAction(formData: FormData) {
  const parsed = schema.safeParse({ email: formData.get('email'), password: formData.get('password') });
  if (!parsed.success) redirect('/admin/login?error=invalid');
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect('/admin/login?error=setup');
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) redirect('/admin/login?error=credentials');
  redirect('/admin');
}
