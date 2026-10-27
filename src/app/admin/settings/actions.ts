'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth';

const urlOrEmpty = z.string().trim().refine(value => !value || /^https:\/\//i.test(value), 'Use a secure https URL.');
const hour = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).or(z.literal(''));
const settingsSchema = z.object({
  shopName: z.string().trim().min(2).max(80), address: z.string().trim().max(240), city: z.string().trim().max(120),
  timezone: z.string().trim().min(3).max(80), whatsapp: z.string().trim().max(24).regex(/^$|^\+?[0-9][0-9\s()-]{7,23}$/),
  instagram: urlOrEmpty, notice: z.coerce.number().int().min(0).max(10080), horizon: z.coerce.number().int().min(1).max(180),
  cancellationDeadline: z.coerce.number().int().min(0).max(10080), rescheduleDeadline: z.coerce.number().int().min(0).max(10080)
});

export async function saveShopSettingsAction(formData: FormData) {
  const { supabase } = await requireAdmin();
  const parsed = settingsSchema.safeParse({
    shopName: formData.get('shop_name'), address: formData.get('address') || '', city: formData.get('city') || '', timezone: formData.get('timezone'),
    whatsapp: formData.get('phone_whatsapp') || '', instagram: formData.get('instagram_url') || '',
    notice: formData.get('booking_notice_minutes'), horizon: formData.get('booking_horizon_days'),
    cancellationDeadline: formData.get('customer_cancellation_deadline_minutes'), rescheduleDeadline: formData.get('customer_reschedule_deadline_minutes')
  });
  if (!parsed.success) redirect('/admin/settings?error=invalid');
  try { new Intl.DateTimeFormat('en', { timeZone: parsed.data.timezone }); }
  catch { redirect('/admin/settings?error=timezone'); }

  const hours = Array.from({ length: 7 }, (_, day_of_week) => {
    const is_closed = formData.get(`closed_${day_of_week}`) === 'on';
    const open = hour.safeParse(formData.get(`open_${day_of_week}`) || '');
    const close = hour.safeParse(formData.get(`close_${day_of_week}`) || '');
    if (!open.success || !close.success || (!is_closed && (!open.data || !close.data || open.data >= close.data))) return null;
    return { day_of_week, is_closed, opens_at: is_closed ? null : open.data, closes_at: is_closed ? null : close.data };
  });
  if (hours.some(day => !day)) redirect('/admin/settings?error=hours');

  const { error } = await supabase.rpc('admin_update_shop_setup', {
    p_shop_name: parsed.data.shopName, p_address: parsed.data.address, p_city: parsed.data.city,
    p_timezone: parsed.data.timezone, p_phone_whatsapp: parsed.data.whatsapp, p_instagram_url: parsed.data.instagram,
    p_booking_notice_minutes: parsed.data.notice, p_booking_horizon_days: parsed.data.horizon,
    p_hours: hours as NonNullable<(typeof hours)[number]>[]
  });
  if (error) { console.error('Shop setup update failed:', error.message); redirect('/admin/settings?error=save'); }
  const { error: policyError } = await supabase.from('shop_settings').update({
    customer_cancellation_deadline_minutes: parsed.data.cancellationDeadline,
    customer_reschedule_deadline_minutes: parsed.data.rescheduleDeadline
  }).eq('id', 1);
  if (policyError) { console.error('Booking policy update failed:', policyError.message); redirect('/admin/settings?error=save'); }
  revalidatePath('/'); revalidatePath('/book'); revalidatePath('/admin/settings');
  redirect('/admin/settings?saved=1');
}
