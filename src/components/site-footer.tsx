import Link from 'next/link';
import { ArrowUpRight, Camera } from 'lucide-react';
import type { ShopSettings } from '@/lib/public-data';

export function SiteFooter({ settings }: { settings: ShopSettings | null }) {
  const whatsapp = settings?.phone_whatsapp?.replace(/\D/g, '');
  const explore = [
    { href: '/services', label: 'Services' },
    { href: '/barbers', label: 'Barbers' },
    { href: '/gallery', label: 'Gallery' },
    { href: '/map', label: 'Find us' },
    { href: '/book', label: 'Book a chair' }
  ];
  return (
    <footer className="bg-ink text-cream">
      <div className="page-shell grid gap-10 py-12 md:grid-cols-[1fr_auto_auto] md:items-end md:gap-12 md:py-14">
        <div>
          <p className="label mb-5 text-lime">Terasbarber</p>
          <p className="display max-w-xl text-4xl leading-[.95] sm:text-6xl">GOOD CUTS.<br />NO SHORTCUTS.</p>
        </div>
        <nav aria-label="Footer" className="flex flex-col text-xs text-white/75">
          <span className="label mb-1 text-white/60">Explore</span>
          {explore.map(item => <Link key={item.href} href={item.href} className="inline-flex min-h-11 items-center hover:text-lime md:min-h-0 md:py-1">{item.label}</Link>)}
        </nav>
        <div className="flex flex-col text-xs text-white/75">
          <span className="label mb-1 text-white/60">Find us</span>
          {settings?.address || settings?.city ? <p className="py-1">{[settings.address, settings.city].filter(Boolean).join(', ')}</p> : <p className="py-1">Shop address to be added.</p>}
          {settings?.instagram_url && <a href={settings.instagram_url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 hover:text-lime md:min-h-0 md:py-1"><Camera size={14} aria-hidden="true" /> Instagram <ArrowUpRight size={12} aria-hidden="true" /></a>}
          {whatsapp && <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center hover:text-lime md:min-h-0 md:py-1">WhatsApp <ArrowUpRight className="ml-1 inline" size={12} aria-hidden="true" /></a>}
        </div>
      </div>
      <div className="page-shell flex flex-col justify-between gap-2 border-t border-white/15 py-5 text-[9px] font-bold uppercase tracking-[.14em] text-white/60 sm:flex-row">
        <span>© {new Date().getFullYear()} {settings?.shop_name || 'Terasbarber'}</span>
        <span>Built for the next good cut.</span>
      </div>
    </footer>
  );
}
