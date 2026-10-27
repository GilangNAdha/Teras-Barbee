export const idr = (amount: number) => new Intl.NumberFormat('id-ID', {
  style: 'currency', currency: 'IDR', maximumFractionDigits: 0
}).format(amount);

export function formatDateTime(value: string, timezone = 'Asia/Jakarta') {
  return new Intl.DateTimeFormat('en-ID', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: timezone
  }).format(new Date(value));
}

export function storagePublicUrl(path: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;
  return `${url}/storage/v1/object/public/shop-media/${path.split('/').map(encodeURIComponent).join('/')}`;
}
