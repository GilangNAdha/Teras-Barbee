import Link from 'next/link';
import { ArrowUpRight, Camera } from 'lucide-react';
import type { ShopSettings } from '@/lib/public-data';

export function SiteFooter({ settings }: { settings: ShopSettings | null }) {
  const whatsapp = settings?.phone_whatsapp?.replace(/\D/g, '');
  return (
    <footer className="bg-ink text-cream">
      <div className="section-pad mx-auto grid max-w-[1800px] gap-12 py-14 md:grid-cols-[1fr_auto_auto] md:items-end">
        <div>
          <p className="label mb-5 text-lime">Terasbarber</p>
          <p className="display max-w-xl text-4xl leading-[.95] sm:text-6xl">GOOD CUTS.<br />NO SHORTCUTS.</p>
        </div>
        <div className="flex flex-col gap-3 text-xs text-white/75">
          <span className="label mb-1 text-white/45">Explore</span>
          <Link href="/services" className="hover:text-lime">Services</Link>
          <Link href="/barbers" className="hover:text-lime">Barbers</Link>
          <Link href="/gallery" className="hover:text-lime">Gallery</Link>
          <Link href="/map" className="hover:text-lime">Find us</Link>
          <Link href="/book" className="hover:text-lime">Book a chair</Link>
        </div>
        <div className="flex flex-col gap-3 text-xs text-white/75">
          <span className="label mb-1 text-white/45">Find us</span>
          {settings?.address || settings?.city ? <p>{[settings.address, settings.city].filter(Boolean).join(', ')}</p> : <p>Shop address to be added.</p>}
          {settings?.instagram_url && <a href={settings.instagram_url} target="_blank" rel="noreferrer" className="flex items-center gap-2 hover:text-lime"><Camera size={14} /> Instagram <ArrowUpRight size={12} /></a>}
          {whatsapp && <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noreferrer" className="hover:text-lime">WhatsApp <ArrowUpRight className="ml-1 inline" size={12} /></a>}
        </div>
      </div>
      <div className="section-pad mx-auto flex max-w-[1800px] flex-col justify-between gap-3 border-t border-white/15 py-5 text-[9px] font-bold uppercase tracking-[.14em] text-white/45 sm:flex-row">
        <span>© {new Date().getFullYear()} {settings?.shop_name || 'Terasbarber'}</span>
        <span>Built for the next good cut.</span>
      </div>
    </footer>
  );
}
