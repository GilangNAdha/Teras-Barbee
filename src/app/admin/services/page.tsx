import type { Metadata } from 'next';
import { AdminShell } from '@/components/admin-shell';
import { createServiceAction, updateServiceAction } from '@/app/admin/actions';
import { requireAdmin } from '@/lib/auth';
import { idr } from '@/lib/format';

export const metadata: Metadata = { title: 'Manage services' };
export const dynamic = 'force-dynamic';
const errors: Record<string, string> = { invalid: 'Check the fields and try again.', duplicate: 'That service slug is already in use.', save: 'The service could not be saved.' };

export default async function AdminServicesPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const [{ error, saved }, auth] = await Promise.all([searchParams, requireAdmin()]);
  const supabase = auth.supabase;
  const { data: services } = await supabase.from('services').select('*').order('sort_order').order('name');
  return <AdminShell active="/admin/services" userLabel={auth.profile.full_name || auth.user.email || 'Administrator'}>
    <p className="label mb-3 text-neutral-500">Catalogue</p><h1 className="display text-5xl sm:text-7xl">SERVICES.</h1>
    {saved && <p role="status" className="mt-5 border border-green-800/20 bg-green-50 p-3 text-xs">Service saved.</p>}
    {error && <p role="alert" className="mt-5 border border-red-800/20 bg-red-50 p-3 text-xs">{errors[error] || 'There was a problem.'}</p>}
    <div className="mt-8 grid gap-8 xl:grid-cols-[1fr_360px]">
      <div className="space-y-4">{services?.map(service => <details key={service.id} className="border border-black/20 bg-cream"><summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4"><span><span className="display text-2xl">{service.name}</span><span className="ml-3 badge">{service.is_active ? 'Active' : 'Hidden'}</span></span><span className="text-xs text-neutral-500">{idr(service.price_idr)} · {service.duration_minutes} min</span></summary>
        <form action={updateServiceAction} className="grid gap-3 border-t border-black/15 p-4 sm:grid-cols-2"><input type="hidden" name="id" value={service.id} />
          <Field label="Name" name="name" defaultValue={service.name} /><Field label="Slug" name="slug" defaultValue={service.slug} /><CategoryField defaultValue={service.category} /><Field label="Duration (minutes)" name="duration_minutes" type="number" defaultValue={service.duration_minutes} /><Field label="Price (IDR)" name="price_idr" type="number" defaultValue={service.price_idr} /><Field label="Sort order" name="sort_order" type="number" defaultValue={service.sort_order} /><Field label="Image URL (optional)" name="image_url" defaultValue={service.image_url || ''} />
          <label className="sm:col-span-2"><span className="label mb-1 block">Description</span><textarea className="form-field min-h-20" name="description" defaultValue={service.description} maxLength={500} /></label>
          <label className="flex min-h-11 items-center gap-2 text-xs"><input type="checkbox" className="size-5 accent-black sm:size-4" name="is_active" defaultChecked={service.is_active} /> Public and bookable</label><button className="btn-dark sm:col-span-2" type="submit">Save changes</button>
        </form></details>)}</div>
      <form action={createServiceAction} className="h-fit border border-black/20 bg-[#e8e4dc] p-5"><p className="label mb-5">Add a service</p><div className="space-y-3"><Field label="Name" name="name" /><Field label="Slug" name="slug" /><CategoryField defaultValue="HAIRCUT" /><Field label="Duration (minutes)" name="duration_minutes" type="number" defaultValue={45} /><Field label="Price (IDR)" name="price_idr" type="number" defaultValue={0} /><Field label="Sort order" name="sort_order" type="number" defaultValue={0} /><Field label="Image URL (optional)" name="image_url" /><label className="block"><span className="label mb-1 block">Description</span><textarea className="form-field min-h-20" name="description" maxLength={500} /></label><label className="flex min-h-11 items-center gap-2 text-xs"><input type="checkbox" className="size-5 accent-black sm:size-4" name="is_active" defaultChecked /> Public and bookable</label><button className="btn-primary w-full" type="submit">Create service</button></div></form>
    </div>
  </AdminShell>;
}

function CategoryField({ defaultValue }: { defaultValue: 'HAIRCUT' | 'COMBO' | 'BEARD' }) {
  return <label className="block"><span className="label mb-1 block">Category</span><select className="form-field" name="category" defaultValue={defaultValue}><option value="HAIRCUT">Haircut</option><option value="COMBO">Combo</option><option value="BEARD">Beard</option></select></label>;
}

function Field({ label, name, type = 'text', defaultValue }: { label: string; name: string; type?: string; defaultValue?: string | number }) {
  return <label className="block"><span className="label mb-1 block">{label}</span><input className="form-field" name={name} type={type} defaultValue={defaultValue} maxLength={type === 'text' ? 240 : undefined} required={['name','slug','duration_minutes','price_idr'].includes(name)} /></label>;
}
