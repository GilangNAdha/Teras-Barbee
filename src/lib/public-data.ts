import { createSupabaseServerClient, hasSupabaseConfig } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import type { Database } from '@/lib/database.types';
import { storagePublicUrl } from '@/lib/format';

export type Service = Database['public']['Tables']['services']['Row'];
export type Barber = Database['public']['Tables']['barbers']['Row'];
export type GalleryImage = Database['public']['Tables']['gallery_images']['Row'];
export type ShopSettings = Database['public']['Tables']['shop_settings']['Row'];

export async function getActiveServicesResult() {
  if (!hasSupabaseConfig()) return { services: [] as Service[], error: false };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { services: [] as Service[], error: false };
  const { data, error } = await supabase.from('services').select('*').eq('is_active', true).order('sort_order').order('name');
  if (error) { console.error('Public services query failed:', error.message); return { services: [] as Service[], error: true }; }
  return { services: data ?? [], error: false };
}

// Keep an unavailable database distinct from an honestly empty shop catalog.
export async function getBookingCatalog() {
  const empty = { services: [] as Service[], barbers: [] as Barber[], barberServices: {} as Record<string, string[]>, settings: null as ShopSettings | null, hours: [] as Database['public']['Tables']['shop_hours']['Row'][] };
  if (!hasSupabaseConfig()) return { ...empty, error: false };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ...empty, error: false };
  const [services, barbers, links, settings, hours] = await Promise.all([
    supabase.from('services').select('*').eq('is_active', true).order('sort_order').order('name'),
    supabase.from('barbers').select('*').eq('is_active', true).order('sort_order').order('name'),
    supabase.from('barber_services').select('barber_id,service_id'),
    supabase.from('shop_settings').select('*').eq('id', 1).maybeSingle(),
    supabase.from('shop_hours').select('*').order('day_of_week')
  ]);
  const error = services.error || barbers.error || links.error || settings.error || hours.error;
  if (error) { console.error('Booking catalog query failed:', error.message); return { ...empty, error: true }; }
  const activeServiceIds = new Set((services.data ?? []).map(service => service.id));
  const activeBarberIds = new Set((barbers.data ?? []).map(barber => barber.id));
  const barberServices = (links.data ?? []).reduce<Record<string, string[]>>((map, link) => {
    if (activeServiceIds.has(link.service_id) && activeBarberIds.has(link.barber_id)) (map[link.barber_id] ??= []).push(link.service_id);
    return map;
  }, {});
  return { services: services.data ?? [], barbers: (barbers.data ?? []).filter(barber => (barberServices[barber.id] ?? []).length > 0), barberServices, settings: settings.data, hours: hours.data ?? [], error: false };
}

export async function getActiveBarbers() {
  if (!hasSupabaseConfig()) return [] as Barber[];
  const supabase = await createSupabaseServerClient();
  if (!supabase) return [] as Barber[];
  const [{ data: barbers, error: barberError }, { data: assignments, error: assignmentError }, { data: services, error: serviceError }] = await Promise.all([
    supabase.from('barbers').select('*').eq('is_active', true).order('sort_order').order('name'),
    supabase.from('barber_services').select('barber_id,service_id'),
    supabase.from('services').select('id').eq('is_active', true)
  ]);
  if (barberError || assignmentError || serviceError) { console.error('Public barber query failed:', barberError?.message || assignmentError?.message || serviceError?.message); return [] as Barber[]; }
  const activeServiceIds = new Set((services ?? []).map(service => service.id));
  const bookableBarberIds = new Set((assignments ?? []).filter(link => activeServiceIds.has(link.service_id)).map(link => link.barber_id));
  return (barbers ?? []).filter(barber => bookableBarberIds.has(barber.id));
}

export async function getBarberContactLinks(barberIds: string[]) {
  const supabase = createSupabaseServiceClient();
  if (!supabase || barberIds.length === 0) return {} as Record<string, string>;
  const { data, error } = await supabase.from('barber_contact_channels').select('barber_id,phone_whatsapp').in('barber_id', barberIds);
  if (error) { console.error('Public barber contact query failed:', error.message); return {} as Record<string, string>; }
  return (data ?? []).reduce<Record<string, string>>((links, contact) => {
    const phone = contact.phone_whatsapp.replace(/\D/g, '');
    if (phone) links[contact.barber_id] = `https://wa.me/${phone}`;
    return links;
  }, {});
}

export async function getBarberServiceIds() {
  if (!hasSupabaseConfig()) return {} as Record<string, string[]>;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return {} as Record<string, string[]>;
  const [{ data: links, error: linkError }, { data: barbers, error: barberError }, { data: services, error: serviceError }] = await Promise.all([
    supabase.from('barber_services').select('barber_id,service_id'),
    supabase.from('barbers').select('id').eq('is_active', true),
    supabase.from('services').select('id').eq('is_active', true)
  ]);
  if (linkError || barberError || serviceError) return {} as Record<string, string[]>;
  const activeBarberIds = new Set((barbers ?? []).map(item => item.id));
  const activeServiceIds = new Set((services ?? []).map(item => item.id));
  return (links ?? []).reduce<Record<string, string[]>>((map, link) => {
    if (activeBarberIds.has(link.barber_id) && activeServiceIds.has(link.service_id)) (map[link.barber_id] ??= []).push(link.service_id);
    return map;
  }, {});
}

export async function getBarberServiceNames() {
  if (!hasSupabaseConfig()) return {} as Record<string, string[]>;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return {} as Record<string, string[]>;
  const [{ data: links, error: linkError }, { data: services, error: serviceError }] = await Promise.all([
    supabase.from('barber_services').select('barber_id,service_id'),
    supabase.from('services').select('id,name').eq('is_active', true)
  ]);
  if (linkError || serviceError) return {} as Record<string, string[]>;
  const names = new Map((services ?? []).map(service => [service.id, service.name]));
  return (links ?? []).reduce<Record<string, string[]>>((map, link) => {
    const name = names.get(link.service_id);
    if (name) (map[link.barber_id] ??= []).push(name);
    return map;
  }, {});
}

export async function getGalleryImages() {
  if (!hasSupabaseConfig()) return [] as GalleryImage[];
  const supabase = await createSupabaseServerClient();
  if (!supabase) return [] as GalleryImage[];
  const { data, error } = await supabase.from('gallery_images').select('*').eq('is_visible', true).order('sort_order').order('created_at', { ascending: false });
  if (error) { console.error('Gallery query failed:', error.message); return [] as GalleryImage[]; }
  return data ?? [];
}

export async function getShopSettings() {
  if (!hasSupabaseConfig()) return null;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const { data, error } = await supabase.from('shop_settings').select('*').eq('id', 1).maybeSingle();
  if (error) { console.error('Shop settings query failed:', error.message); return null; }
  return data;
}

export async function getShopHours() {
  if (!hasSupabaseConfig()) return [] as Database['public']['Tables']['shop_hours']['Row'][];
  const supabase = await createSupabaseServerClient();
  if (!supabase) return [] as Database['public']['Tables']['shop_hours']['Row'][];
  const { data, error } = await supabase.from('shop_hours').select('*').order('day_of_week');
  if (error) { console.error('Shop hours query failed:', error.message); return [] as Database['public']['Tables']['shop_hours']['Row'][]; }
  return data ?? [];
}

export async function getAdminAppointments() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return [];
  const { data, error } = await supabase.from('appointments').select('id,booking_code,customer_name,customer_phone,service_id,barber_id,starts_at,ends_at,status,notes,created_at').order('starts_at', { ascending: false }).limit(200);
  if (error) { console.error('Admin appointments query failed:', error.message); return []; }
  return data ?? [];
}

export const publicImageUrl = storagePublicUrl;
