import Link from 'next/link';
import { AlertTriangle, ArrowUpRight } from 'lucide-react';

export function SetupNotice({ children = 'Online bookings are temporarily unavailable while the shop booking settings are being configured.' }: { children?: string }) {
  const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  if (configured) return null;
  return <div role="note" className="border-y border-black/15 bg-lime px-5 py-3 text-xs font-semibold leading-5 text-ink">
    <div className="mx-auto flex max-w-6xl items-start gap-2"><AlertTriangle aria-hidden="true" className="mt-0.5 shrink-0" size={15} /><p>{children} Add Supabase credentials to enable live data. <Link className="inline-flex min-h-11 items-center gap-1 underline underline-offset-2" href="/admin/login">Admin setup <ArrowUpRight aria-hidden="true" size={12} /></Link></p></div>
  </div>;
}
