'use client';

import Image from 'next/image';
import { useState } from 'react';
import { LoaderCircle, Trash2, Upload } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
const MAX_BYTES = 8 * 1024 * 1024;

interface ImageUploadFieldProps {
  label: string;
  name: string;
  folder: 'portraits' | 'cuts';
  value: string;
  onChange: (nextUrl: string) => void;
  onBusyChange: (busy: boolean) => void;
  aspectClass?: string;
}

function BarberImageUploadField({
  label,
  name,
  folder,
  value,
  onChange,
  onBusyChange,
  aspectClass = 'aspect-[4/5] w-24'
}: ImageUploadFieldProps) {
  const [uploading, setUploading] = useState(false);
  const [draftPath, setDraftPath] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!ALLOWED_TYPES.includes(file.type) || file.size > MAX_BYTES) {
      setError('Use JPEG, PNG, WebP, or AVIF under 8 MB.');
      return;
    }
    const client = createSupabaseBrowserClient();
    if (!client) {
      setError('Supabase is not configured.');
      return;
    }

    setError('');
    setUploading(true);
    onBusyChange(true);
    const ext = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    const path = `barbers/${folder}/${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await client.storage
      .from('shop-media')
      .upload(path, file, { contentType: file.type, upsert: false });

    setUploading(false);
    onBusyChange(false);

    if (uploadError) {
      setError(uploadError.message);
      return;
    }

    if (draftPath) {
      await client.storage.from('shop-media').remove([draftPath]);
    }
    const { data } = client.storage.from('shop-media').getPublicUrl(path);
    setDraftPath(path);
    onChange(data.publicUrl);
  }

  async function handleRemove() {
    setError('');
    if (draftPath) {
      const client = createSupabaseBrowserClient();
      if (client) await client.storage.from('shop-media').remove([draftPath]);
      setDraftPath(null);
    }
    onChange('');
  }

  return (
    <div className="block">
      <span className="label mb-1 block">{label}</span>
      <input type="hidden" name={name} value={value} />
      <div className="border border-black/20 bg-white/40 p-3">
        {value ? (
          <div className="flex items-center gap-3">
            <div className={`relative shrink-0 overflow-hidden border border-black/15 bg-neutral-200 ${aspectClass}`}>
              <Image src={value} alt={label} fill sizes="120px" unoptimized className="object-cover" />
            </div>
            <div className="flex min-w-0 flex-wrap gap-2">
              <label className="inline-flex cursor-pointer items-center gap-1.5 border border-black/25 px-3 py-2 text-[10px] font-bold uppercase tracking-wider hover:bg-lime">
                {uploading ? <LoaderCircle className="animate-spin" size={13} /> : <Upload size={13} />}
                {uploading ? 'Uploading…' : 'Replace'}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/avif"
                  className="sr-only"
                  disabled={uploading}
                  onChange={event => void handleFileChange(event)}
                />
              </label>
              <button
                type="button"
                disabled={uploading}
                onClick={() => void handleRemove()}
                className="inline-flex items-center gap-1 border border-black/25 px-2.5 py-2 text-[10px] font-bold uppercase tracking-wider hover:bg-red-100"
                aria-label={`Remove ${label}`}
              >
                <Trash2 size={13} /> Remove
              </button>
            </div>
          </div>
        ) : (
          <label className="flex cursor-pointer items-center justify-between gap-3 py-1.5 text-xs text-neutral-700 hover:text-black">
            <span className="inline-flex items-center gap-2 font-semibold">
              {uploading ? <LoaderCircle className="animate-spin" size={15} /> : <Upload size={15} />}
              {uploading ? 'Uploading image…' : 'Upload image'}
            </span>
            <span className="text-[10px] text-neutral-500">JPG, PNG, WebP, AVIF · Max 8 MB</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              className="sr-only"
              disabled={uploading}
              onChange={event => void handleFileChange(event)}
            />
          </label>
        )}
      </div>
      {error && <p role="alert" className="mt-1.5 text-[11px] text-red-800">{error}</p>}
    </div>
  );
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export interface BarberEditorFormProps {
  action: (formData: FormData) => void | Promise<void>;
  id?: string;
  name: string;
  slug: string;
  portraitUrl: string;
  previewCutUrl: string;
  yearsExperience: number | null;
  phoneWhatsApp: string;
  active: boolean;
  sortOrder?: number;
  services: { id: string; name: string }[];
  selectedServiceIds: string[];
  create?: boolean;
}

export function BarberEditorForm({
  action,
  id,
  name: initialName,
  slug: initialSlug,
  portraitUrl: initialPortraitUrl,
  previewCutUrl: initialPreviewCutUrl,
  yearsExperience,
  phoneWhatsApp,
  active,
  sortOrder = 0,
  services,
  selectedServiceIds,
  create = false
}: BarberEditorFormProps) {
  const [nameValue, setNameValue] = useState(initialName);
  const [slugValue, setSlugValue] = useState(initialSlug);
  const [slugEdited, setSlugEdited] = useState(Boolean(initialSlug));
  const [portraitUrl, setPortraitUrl] = useState(initialPortraitUrl);
  const [previewCutUrl, setPreviewCutUrl] = useState(initialPreviewCutUrl);
  const [uploadCount, setUploadCount] = useState(0);

  const selected = new Set(selectedServiceIds);
  const uploading = uploadCount > 0;

  function adjustBusy(busy: boolean) {
    setUploadCount(current => Math.max(0, current + (busy ? 1 : -1)));
  }

  return (
    <form
      action={action}
      className={`grid gap-3 p-4 sm:grid-cols-2 ${create ? 'h-fit border border-black/20 bg-[#e8e4dc] p-5' : 'border-t border-black/15'}`}
    >
      {create && <p className="label mb-2 sm:col-span-2">Add a barber</p>}
      {id && <input type="hidden" name="id" value={id} />}
      <label className="block">
        <span className="label mb-1 block">Name</span>
        <input
          className="form-field"
          name="name"
          value={nameValue}
          onChange={event => {
            const next = event.target.value;
            setNameValue(next);
            if (create && !slugEdited) setSlugValue(slugify(next));
          }}
          maxLength={240}
          required
        />
      </label>
      <label className="block">
        <span className="label mb-1 block">Slug</span>
        <input
          className="form-field"
          name="slug"
          value={slugValue}
          onChange={event => {
            setSlugEdited(true);
            setSlugValue(event.target.value);
          }}
          maxLength={240}
          required
        />
      </label>
      <div className="sm:col-span-2 grid gap-3 sm:grid-cols-2">
        <BarberImageUploadField
          label="Portrait (optional)"
          name="portrait_url"
          folder="portraits"
          value={portraitUrl}
          onChange={setPortraitUrl}
          onBusyChange={adjustBusy}
          aspectClass="aspect-[4/5] w-16"
        />
        <BarberImageUploadField
          label="Cut preview image (optional)"
          name="preview_cut_url"
          folder="cuts"
          value={previewCutUrl}
          onChange={setPreviewCutUrl}
          onBusyChange={adjustBusy}
          aspectClass="aspect-[16/10] w-24"
        />
      </div>
      <Field label="Years of experience (optional)" name="years_experience" type="number" defaultValue={yearsExperience ?? ''} min={0} max={60} />
      <Field label="Public WhatsApp contact (optional)" name="phone_whatsapp" type="tel" defaultValue={phoneWhatsApp} placeholder="+62…" />
      <Field label="Sort order" name="sort_order" type="number" defaultValue={sortOrder} />
      <fieldset className="sm:col-span-2">
        <legend className="label mb-2">Services offered</legend>
        {services.length ? (
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {services.map(service => (
              <label key={service.id} className="flex items-center gap-2 text-xs">
                <input type="checkbox" name="service_ids" value={service.id} defaultChecked={selected.has(service.id)} />
                {service.name}
              </label>
            ))}
          </div>
        ) : (
          <p className="text-xs text-neutral-500">Add services first to assign them to this barber.</p>
        )}
      </fieldset>
      <label className="flex items-center gap-2 text-xs sm:col-span-2">
        <input type="checkbox" name="is_active" defaultChecked={active} /> Public and bookable
      </label>
      <button className={`${create ? 'btn-primary' : 'btn-dark'} sm:col-span-2`} type="submit" disabled={uploading}>
        {uploading ? 'Waiting for image upload…' : create ? 'Add barber' : 'Save profile'}
      </button>
    </form>
  );
}

function Field({
  label,
  name,
  defaultValue,
  type = 'text',
  required = false,
  placeholder,
  min,
  max
}: {
  label: string;
  name: string;
  defaultValue?: string | number;
  type?: string;
  required?: boolean;
  placeholder?: string;
  min?: number;
  max?: number;
}) {
  return (
    <label className="block">
      <span className="label mb-1 block">{label}</span>
      <input
        className="form-field"
        type={type}
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        min={min}
        max={max}
        maxLength={type === 'text' ? 240 : undefined}
        required={required}
      />
    </label>
  );
}
