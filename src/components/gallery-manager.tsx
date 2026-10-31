'use client';

import { useState } from 'react';
import Image from 'next/image';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { LoaderCircle, Trash2, Upload } from 'lucide-react';

type GalleryEntry = { id: string; storage_path: string; alt_text: string; category: string | null; sort_order: number; is_visible: boolean; url: string | null };
const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];

export function GalleryManager({ initial }: { initial: GalleryEntry[] }) {
  const [images, setImages] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function addImage(formData: FormData) {
    const file = formData.get('file');
    const alt = String(formData.get('alt') || '').trim();
    const category = String(formData.get('category') || '').trim();
    if (!(file instanceof File) || !file.size) { setMessage('Choose an image file first.'); return; }
    if (!allowed.includes(file.type) || file.size > 8 * 1024 * 1024) { setMessage('Use JPEG, PNG, WebP, or AVIF under 8 MB.'); return; }
    if (alt.length < 5 || alt.length > 240) { setMessage('Add accurate descriptive alt text (5–240 characters).'); return; }
    const client = createSupabaseBrowserClient();
    if (!client) { setMessage('Supabase is not configured.'); return; }
    setBusy(true); setMessage('');
    const extension = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    const path = `gallery/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await client.storage.from('shop-media').upload(path, file, { contentType: file.type, upsert: false });
    if (uploadError) { setBusy(false); setMessage(uploadError.message); return; }
    const { data, error } = await client.from('gallery_images').insert({ storage_path: path, alt_text: alt, category: category || null, is_visible: true }).select('id,storage_path,alt_text,category,sort_order,is_visible').single();
    if (error || !data) {
      await client.storage.from('shop-media').remove([path]);
      setBusy(false); setMessage(error?.message || 'Image could not be saved.'); return;
    }
    setImages(current => [{ ...data, url: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/shop-media/${path}` }, ...current]);
    setBusy(false);
    const form = document.querySelector<HTMLFormElement>('#gallery-upload'); form?.reset();
    setMessage('Image uploaded and published.');
  }
  async function toggleVisible(image: GalleryEntry) {
    const client = createSupabaseBrowserClient(); if (!client) return;
    setBusy(true); setMessage('');
    const { error } = await client.from('gallery_images').update({ is_visible: !image.is_visible }).eq('id', image.id);
    if (error) setMessage(error.message); else setImages(current => current.map(item => item.id === image.id ? { ...item, is_visible: !item.is_visible } : item));
    setBusy(false);
  }
  async function setHomepageHero(image: GalleryEntry) {
    const client = createSupabaseBrowserClient(); if (!client) return;
    setBusy(true); setMessage('');
    const { error: clearError } = await client.from('gallery_images').update({ sort_order: 0 }).eq('sort_order', -1).neq('id', image.id);
    if (clearError) { setBusy(false); setMessage(clearError.message); return; }
    const { error } = await client.from('gallery_images').update({ sort_order: -1, is_visible: true }).eq('id', image.id);
    if (error) { setBusy(false); setMessage(error.message); return; }
    setImages(current => current.map(item => ({
      ...item,
      sort_order: item.id === image.id ? -1 : item.sort_order === -1 ? 0 : item.sort_order,
      is_visible: item.id === image.id ? true : item.is_visible
    })));
    setBusy(false); setMessage('Homepage background image updated.');
  }

  async function removeImage(image: GalleryEntry) {
    if (!window.confirm('Delete this gallery image?')) return;
    const client = createSupabaseBrowserClient(); if (!client) return;
    setBusy(true); setMessage('');
    const { error } = await client.from('gallery_images').delete().eq('id', image.id);
    if (error) { setBusy(false); setMessage(error.message); return; }
    await client.storage.from('shop-media').remove([image.storage_path]);
    setImages(current => current.filter(item => item.id !== image.id));
    setBusy(false); setMessage('Image deleted.');
  }

  return <div>
    <form id="gallery-upload" action={addImage} className="grid gap-3 border border-black/20 bg-[#e8e4dc] p-5 sm:grid-cols-[1fr_1fr_1.4fr_auto] sm:items-end">
      <label><span className="label mb-1 block">Image file</span><input className="form-field" type="file" name="file" accept="image/jpeg,image/png,image/webp,image/avif" required /></label>
      <label><span className="label mb-1 block">Category</span><input className="form-field" name="category" maxLength={60} placeholder="Optional" /></label>
      <label><span className="label mb-1 block">Descriptive alt text</span><input className="form-field" name="alt" minLength={5} maxLength={240} required /></label>
      <button className="btn-primary" type="submit" disabled={busy}>{busy ? <LoaderCircle aria-hidden="true" className="animate-spin" size={15} /> : <Upload aria-hidden="true" size={15} />} Upload</button>
    </form>
    {message && <p role="status" className="mt-3 text-xs text-neutral-600">{message}</p>}
    <p className="mt-3 text-[10px] text-neutral-500">JPEG, PNG, WebP, or AVIF · Maximum 8 MB. Alt text must accurately describe the photo.</p>
    <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{images.map(image => <article key={image.id} className="border border-black/20">
      <div className="aspect-[4/3] bg-neutral-200">{image.url && <Image src={image.url} alt={image.alt_text} width={600} height={450} unoptimized className="h-full w-full object-cover grayscale" />}</div>
      <div className="p-3">
        <p className="text-xs font-bold">{image.alt_text}</p>
        <p className="mt-1 text-[10px] text-neutral-500">{image.category || 'Uncategorized'} · {image.is_visible ? 'Public' : 'Hidden'}</p>
        {image.sort_order === -1 && image.is_visible && <span className="mt-2 inline-block bg-lime px-2 py-1 text-[9px] font-bold uppercase tracking-wide">Homepage background</span>}
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => toggleVisible(image)} className="min-h-11 border border-black/20 px-3 py-2 text-[10px] font-bold uppercase hover:bg-lime lg:min-h-0 lg:text-[9px]">{image.is_visible ? 'Hide' : 'Publish'}</button>
          <button type="button" disabled={busy || (image.sort_order === -1 && image.is_visible)} onClick={() => setHomepageHero(image)} className="min-h-11 border border-black/20 px-3 py-2 text-[10px] font-bold uppercase hover:bg-lime lg:min-h-0 lg:text-[9px]">{image.sort_order === -1 && image.is_visible ? 'Current hero' : 'Set as homepage hero'}</button>
          <button type="button" disabled={busy} onClick={() => removeImage(image)} className="grid size-11 place-items-center border border-black/20 hover:bg-red-100 lg:size-9" aria-label={`Delete ${image.alt_text}`}><Trash2 aria-hidden="true" size={13} /></button>
        </div>
      </div>
    </article>)}</div>
    {!images.length && <p className="mt-8 border-y border-black/20 py-7 text-sm text-neutral-600">No gallery images yet. Upload shop-approved photos.</p>}
  </div>;
}
