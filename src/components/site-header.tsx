'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowUpRight, Menu, X } from 'lucide-react';

const links = [
  { href: '/services', label: 'Services' },
  { href: '/barbers', label: 'Barbers' },
  { href: '/gallery', label: 'Gallery' },
  { href: '/map', label: 'Find us' }
];

export function SiteHeader({ shopName = 'TERASBARBER' }: { shopName?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <header className="site-header relative z-50 border-b border-white/15 bg-ink text-cream">
      <div className="header-grid section-pad relative mx-auto h-[82px] max-w-[1800px]">
        <Link href="/" className="flex w-fit items-center gap-2" aria-label={`${shopName} home`} onClick={() => setOpen(false)}>
          <span className="display grid size-9 place-items-center border border-white/40 text-[15px] text-lime">TB</span>
          <span className="label text-[11px] tracking-[.19em]">{shopName}</span>
        </Link>
        <nav className="header-nav flex items-center gap-9" aria-label="Main navigation">
          {links.map(link => <Link key={link.href} className="label transition-colors hover:text-lime" href={link.href}>{link.label}</Link>)}
        </nav>
        <div className="header-actions"><Link className="btn-primary" href="/book">Book now <ArrowUpRight size={14} /></Link></div>
        <button className="mobile-menu grid size-10 place-items-center border border-white/25" type="button" aria-label={open ? 'Close navigation' : 'Open navigation'} aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>
      {open && <nav className="header-mobile-open" aria-label="Mobile navigation">
        {links.map(link => <Link key={link.href} href={link.href} onClick={() => setOpen(false)}>{link.label}</Link>)}
        <Link className="mobile-book" href="/book" onClick={() => setOpen(false)}>Book now <ArrowUpRight className="ml-2 inline" size={14} /></Link>
      </nav>}
    </header>
  );
}
