import type { Metadata } from 'next';
import { AdminShell } from '@/components/admin-shell';
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
  const assigned = new Map<string, Set<string>>();
  links?.forEach(link => { const list = assigned.get(link.barber_id) ?? new Set<string>(); list.add(link.service_id); assigned.set(link.barber_id, list); });
  return <AdminShell active="/admin/barbers" userLabel={auth.profile.full_name || auth.user.email || 'Administrator'}>
    <p className="label mb-3 text-neutral-500">People</p><h1 className="display text-5xl sm:text-7xl">BARBERS.</h1>
    {saved && <p role="status" className="mt-5 border border-green-800/20 bg-green-50 p-3 text-xs">Barber profile saved.</p>}
    {error && <p role="alert" className="mt-5 border border-red-800/20 bg-red-50 p-3 text-xs">{errors[error] || 'There was a problem.'}</p>}
    <div className="mt-8 grid gap-8 xl:grid-cols-[1fr_360px]">
      <div className="space-y-4">{barbers?.map(barber => <details key={barber.id} className="border border-black/20"><summary className="flex cursor-pointer items-center justify-between gap-3 p-4"><span className="display text-2xl">{barber.name}</span><span className="badge">{!barber.is_active ? 'Hidden' : (assigned.get(barber.id)?.size ?? 0) === 0 ? 'No services' : 'Active / bookable'}</span></summary>
        <BarberEditor action={updateBarberAction} id={barber.id} name={barber.name} slug={barber.slug} bio={barber.bio} specialties={barber.specialties.join(', ')} portraitUrl={barber.portrait_url || ''} previewCutUrl={barber.preview_cut_url || ''} yearsExperience={barber.years_experience} phoneWhatsApp={contactByBarber.get(barber.id) || ''} active={barber.is_active} sortOrder={barber.sort_order} services={services ?? []} selected={assigned.get(barber.id) ?? new Set()} />
      </details>)}</div>
      <BarberEditor action={createBarberAction} name="" slug="" bio="" specialties="" portraitUrl="" previewCutUrl="" yearsExperience={null} phoneWhatsApp="" active services={services ?? []} selected={new Set()} create />
    </div>
  </AdminShell>;
}

function BarberEditor({ action, id, name, slug, bio, specialties, portraitUrl, previewCutUrl, yearsExperience, phoneWhatsApp, active, sortOrder = 0, services, selected, create = false }: {
  action: (formData: FormData) => void | Promise<void>; id?: string; name: string; slug: string; bio: string; specialties: string; portraitUrl: string; previewCutUrl: string; yearsExperience: number | null; phoneWhatsApp: string; active: boolean; sortOrder?: number;
  services: { id: string; name: string }[]; selected: Set<string>; create?: boolean;
}) {
  return <form action={action} className="grid gap-3 border-t border-black/15 p-4 sm:grid-cols-2">
    {id && <input type="hidden" name="id" value={id} />}
    <Field label="Name" name="name" defaultValue={name} required /><Field label="Slug" name="slug" defaultValue={slug} required />
    <Field label="Portrait URL (optional)" name="portrait_url" defaultValue={portraitUrl} /><Field label="Cut preview image URL (optional)" name="preview_cut_url" defaultValue={previewCutUrl} placeholder="HTTPS image URL" /><Field label="Years of experience (optional)" name="years_experience" type="number" defaultValue={yearsExperience ?? ''} min={0} max={60} /><Field label="Public WhatsApp contact (optional)" name="phone_whatsapp" type="tel" defaultValue={phoneWhatsApp} placeholder="+62…" /><Field label="Sort order" name="sort_order" type="number" defaultValue={sortOrder} />
    <label className="sm:col-span-2"><span className="label mb-1 block">Biography</span><textarea className="form-field min-h-20" name="bio" maxLength={1000} defaultValue={bio} /></label>
    <label className="sm:col-span-2"><span className="label mb-1 block">Specialties (comma-separated)</span><input className="form-field" name="specialties" defaultValue={specialties} /></label>
    <fieldset className="sm:col-span-2"><legend className="label mb-2">Services offered</legend><div className="flex flex-wrap gap-x-4 gap-y-2">{services.map(service => <label key={service.id} className="flex items-center gap-2 text-xs"><input type="checkbox" name="service_ids" value={service.id} defaultChecked={selected.has(service.id)} />{service.name}</label>)}</div></fieldset>
    <label className="flex items-center gap-2 text-xs"><input type="checkbox" name="is_active" defaultChecked={active} /> Public and bookable</label>
    <button className={`${create ? 'btn-primary' : 'btn-dark'} sm:col-span-2`} type="submit">{create ? 'Add barber' : 'Save profile'}</button>
  </form>;
}
function Field({ label, name, defaultValue, type = 'text', required = false, placeholder, min, max }: { label: string; name: string; defaultValue?: string | number; type?: string; required?: boolean; placeholder?: string; min?: number; max?: number }) {
  return <label className="block"><span className="label mb-1 block">{label}</span><input className="form-field" type={type} name={name} defaultValue={defaultValue} placeholder={placeholder} min={min} max={max} maxLength={type === 'text' ? 240 : undefined} required={required} /></label>;
}
