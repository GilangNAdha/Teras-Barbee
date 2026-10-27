'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import { serviceInputSchema, appointmentStatusSchema } from '@/lib/validation/booking';
import { barberInputSchema } from '@/lib/validation/barber';

const uuidSchema = z.uuid();

function serviceFromForm(formData: FormData) {
  return serviceInputSchema.safeParse({
    name: formData.get('name'), slug: formData.get('slug'), description: formData.get('description') || '', category: formData.get('category') || 'HAIRCUT',
    duration_minutes: Number(formData.get('duration_minutes')), price_idr: Number(formData.get('price_idr')),
    image_url: String(formData.get('image_url') || '').trim() || null,
    is_active: formData.get('is_active') === 'on', sort_order: Number(formData.get('sort_order') || 0)
  });
}

export async function createServiceAction(formData: FormData) {
  const { supabase } = await requireAdmin();
  const parsed = serviceFromForm(formData);
  if (!parsed.success) redirect('/admin/services?error=invalid');
  const { error } = await supabase.from('services').insert(parsed.data);
  if (error) redirect(`/admin/services?error=${error.code === '23505' ? 'duplicate' : 'save'}`);
  revalidatePath('/services'); revalidatePath('/'); revalidatePath('/admin/services');
  redirect('/admin/services?saved=1');
}

export async function updateServiceAction(formData: FormData) {
  const { supabase } = await requireAdmin();
  const id = uuidSchema.safeParse(formData.get('id'));
  const parsed = serviceFromForm(formData);
  if (!id.success || !parsed.success) redirect('/admin/services?error=invalid');
  const { error } = await supabase.from('services').update(parsed.data).eq('id', id.data);
  if (error) redirect(`/admin/services?error=${error.code === '23505' ? 'duplicate' : 'save'}`);
  revalidatePath('/services'); revalidatePath('/'); revalidatePath('/admin/services');
  redirect('/admin/services?saved=1');
}

export async function updateAppointmentAction(formData: FormData) {
  const { supabase } = await requireAdmin();
  const requestedReturn = String(formData.get('return_to') || '');
  const returnTo = /^\/admin\/bookings(?:\?page=\d{1,6}&status=(?:all|pending|confirmed|cancelled|completed|no_show))?$/.test(requestedReturn) ? requestedReturn : '/admin';
  const resultUrl = (result: string) => `${returnTo}${returnTo.includes('?') ? '&' : '?'}${result}`;
  const id = uuidSchema.safeParse(formData.get('id'));
  const status = appointmentStatusSchema.safeParse({ status: formData.get('status') });
  if (!id.success || !status.success) redirect(resultUrl('error=invalid'));
  const { error } = await supabase.from('appointments').update({ status: status.data.status }).eq('id', id.data);
  if (error) redirect(resultUrl('error=save'));
  revalidatePath('/admin'); revalidatePath('/admin/bookings');
  redirect(resultUrl('saved=1'));
}

export async function createBarberAction(formData: FormData) {
  const { supabase } = await requireAdmin();
  const parsed = barberInputSchema.safeParse({
    name: formData.get('name'), slug: formData.get('slug'), bio: formData.get('bio') || '',
    specialties: String(formData.get('specialties') || '').split(',').map(value => value.trim()).filter(Boolean),
    portrait_url: String(formData.get('portrait_url') || '').trim() || null,
    preview_cut_url: String(formData.get('preview_cut_url') || '').trim() || null,
    years_experience: String(formData.get('years_experience') || '').trim() ? Number(formData.get('years_experience')) : null,
    phone_whatsapp: String(formData.get('phone_whatsapp') || '').trim() || null,
    is_active: formData.get('is_active') === 'on', sort_order: Number(formData.get('sort_order') || 0)
  });
  const serviceIds = formData.getAll('service_ids').map(String).filter(value => uuidSchema.safeParse(value).success);
  if (!parsed.success) redirect('/admin/barbers?error=invalid');
  const { phone_whatsapp, ...barberData } = parsed.data;
  const { data: barber, error } = await supabase.from('barbers').insert(barberData).select('id').single();
  if (error || !barber) redirect(`/admin/barbers?error=${error?.code === '23505' ? 'duplicate' : 'save'}`);
  if (serviceIds.length) {
    const { error: linkError } = await supabase.rpc('set_barber_services', { p_barber_id: barber.id, p_service_ids: serviceIds });
    if (linkError) {
      await supabase.from('barbers').delete().eq('id', barber.id);
      redirect('/admin/barbers?error=service-link');
    }
  }
  if (phone_whatsapp) {
    const { error: contactError } = await supabase.from('barber_contact_channels').insert({ barber_id: barber.id, phone_whatsapp });
    if (contactError) {
      await supabase.from('barbers').delete().eq('id', barber.id);
      redirect('/admin/barbers?error=contact');
    }
  }
  revalidatePath('/barbers'); revalidatePath('/'); revalidatePath('/admin/barbers');
  redirect('/admin/barbers?saved=1');
}

export async function updateBarberAction(formData: FormData) {
  const { supabase } = await requireAdmin();
  const id = uuidSchema.safeParse(formData.get('id'));
  const parsed = barberInputSchema.safeParse({
    name: formData.get('name'), slug: formData.get('slug'), bio: formData.get('bio') || '',
    specialties: String(formData.get('specialties') || '').split(',').map(value => value.trim()).filter(Boolean),
    portrait_url: String(formData.get('portrait_url') || '').trim() || null,
    preview_cut_url: String(formData.get('preview_cut_url') || '').trim() || null,
    years_experience: String(formData.get('years_experience') || '').trim() ? Number(formData.get('years_experience')) : null,
    phone_whatsapp: String(formData.get('phone_whatsapp') || '').trim() || null,
    is_active: formData.get('is_active') === 'on', sort_order: Number(formData.get('sort_order') || 0)
  });
  const serviceIds = formData.getAll('service_ids').map(String).filter(value => uuidSchema.safeParse(value).success);
  if (!id.success || !parsed.success) redirect('/admin/barbers?error=invalid');
  const { phone_whatsapp, ...barberData } = parsed.data;
  const { error } = await supabase.from('barbers').update(barberData).eq('id', id.data);
  if (error) redirect(`/admin/barbers?error=${error.code === '23505' ? 'duplicate' : 'save'}`);
  const contactResult = phone_whatsapp
    ? await supabase.from('barber_contact_channels').upsert({ barber_id: id.data, phone_whatsapp })
    : await supabase.from('barber_contact_channels').delete().eq('barber_id', id.data);
  if (contactResult.error) redirect('/admin/barbers?error=contact');
  const { error: linkError } = await supabase.rpc('set_barber_services', { p_barber_id: id.data, p_service_ids: serviceIds });
  if (linkError) redirect('/admin/barbers?error=service-link');
  revalidatePath('/barbers'); revalidatePath('/'); revalidatePath('/admin/barbers');
  redirect('/admin/barbers?saved=1');
}

export async function signOutAction() {
  const { supabase } = await requireAdmin();
  await supabase.auth.signOut();
  redirect('/admin/login');
}
