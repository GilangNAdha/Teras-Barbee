import type { Metadata } from 'next';
import { AdminShell } from '@/components/admin-shell';
import { GalleryManager } from '@/components/gallery-manager';
import { getGalleryImages, publicImageUrl } from '@/lib/public-data';
import { requireAdmin } from '@/lib/auth';

export const metadata: Metadata = { title: 'Manage gallery' };
export const dynamic = 'force-dynamic';

export default async function AdminGalleryPage() {
  const [visible, auth] = await Promise.all([getGalleryImages(), requireAdmin()]);
  const supabase = auth.supabase;
  const { data: allImages } = await supabase.from('gallery_images').select('*').order('sort_order').order('created_at', { ascending: false });
  const images = (allImages ?? visible).map(image => ({ ...image, url: publicImageUrl(image.storage_path) }));
  return <AdminShell active="/admin/gallery" userLabel={auth.profile.full_name || auth.user.email || 'Administrator'}>
    <p className="label mb-3 text-neutral-500">Shop media</p><h1 className="display text-5xl sm:text-7xl">GALLERY.</h1>
    <p className="mt-4 max-w-xl text-sm leading-6 text-neutral-600">Upload approved shop photos, write accurate alt text, and control which images appear in the public gallery. Only admin accounts can upload or delete files.</p>
    <div className="mt-8"><GalleryManager initial={images} /></div>
  </AdminShell>;
}
