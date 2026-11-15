import type { Metadata } from 'next';
import { AdminShell } from '@/components/admin-shell';
import { BarberEditorForm } from '@/components/barber-editor-form';
import { createBarberAction, updateBarberAction } from '@/app/admin/actions';
import { requireAdmin } from '@/lib/auth';

export const metadata: Metadata = { title: 'Manage barbers' };
export const dynamic = 'force-dynamic';
const errors: Record<string, string> = { invalid: 'Check the profile fields.', duplicate: 'That barber slug is already in use.', save: 'The profile could not be saved.', contact: 'The profile was saved, but its WhatsApp contact could not be updated.', 'service-link': 'The barber profile was saved but its services could not be assigned.' };

export default async function AdminBarbersPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const [{ error, saved }, auth] = await Promise.all([searchParams, requireAdmin()]);
  const supabase = auth.supabase;
  const [{ data: barbers }, { data: services }, { data: links }, { data: contacts }] = await Promise.all([
    supabase.from('barbers').select('*').order('sort_order').order('name'),
    supabase.from('services').select('id,name').order('name'),
    supabase.from('barber_services').select('barber_id,service_id'),
    supabase.from('barber_contact_channels').select('barber_id,phone_whatsapp')
  ]);
  const contactByBarber = new Map((contacts ?? []).map(contact => [contact.barber_id, contact.phone_whatsapp]));
  const assigned = new Map<string, string[]>();
  links?.forEach(link => { const list = assigned.get(link.barber_id) ?? []; list.push(link.service_id); assigned.set(link.barber_id, list); });
  return <AdminShell active="/admin/barbers" userLabel={auth.profile.full_name || auth.user.email || 'Administrator'}>
    <p className="label mb-3 text-neutral-500">People</p><h1 className="display text-5xl sm:text-7xl">BARBERS.</h1>
    {saved && <p role="status" className="mt-5 border border-green-800/20 bg-green-50 p-3 text-xs">Barber profile saved.</p>}
    {error && <p role="alert" className="mt-5 border border-red-800/20 bg-red-50 p-3 text-xs">{errors[error] || 'There was a problem.'}</p>}
    <div className="mt-8 grid gap-8 xl:grid-cols-[1fr_400px]">
      <div className="space-y-4">{barbers?.map(barber => <details key={barber.id} className="border border-black/20"><summary className="flex cursor-pointer items-center justify-between gap-3 p-4"><span className="display text-2xl">{barber.name}</span><span className="badge">{!barber.is_active ? 'Hidden' : (assigned.get(barber.id)?.length ?? 0) === 0 ? 'No services' : 'Active / bookable'}</span></summary>
        <BarberEditorForm action={updateBarberAction} id={barber.id} name={barber.name} slug={barber.slug} portraitUrl={barber.portrait_url || ''} previewCutUrl={barber.preview_cut_url || ''} yearsExperience={barber.years_experience} phoneWhatsApp={contactByBarber.get(barber.id) || ''} active={barber.is_active} sortOrder={barber.sort_order} services={services ?? []} selectedServiceIds={assigned.get(barber.id) ?? []} />
      </details>)}</div>
      <BarberEditorForm key={`create-${barbers?.map(item => item.id).join(',') || 'empty'}`} action={createBarberAction} name="" slug="" portraitUrl="" previewCutUrl="" yearsExperience={null} phoneWhatsApp="" active services={services ?? []} selectedServiceIds={[]} create />
    </div>
  </AdminShell>;
}
