'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Menu, X } from 'lucide-react';

const navigationItems = [
  { label: 'Home', href: '/' },
  { label: 'Services', href: '/services' },
  { label: 'Barbers', href: '/barbers' },
  { label: 'Gallery', href: '/gallery' },
  { label: 'Find us', href: '/map' },
  { label: 'Book now', href: '/book' }
];

export function SiteHeader({ shopName = 'TERASBARBER' }: { shopName?: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Also close on browser back/forward and programmatic navigation.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
        toggleRef.current?.focus();
      }
    }
    function onPointerDown(event: PointerEvent) {
      if (!headerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    const desktop = window.matchMedia('(min-width: 901px)');
    function onResize(event: MediaQueryListEvent) {
      if (event.matches) setOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    desktop.addEventListener('change', onResize);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
      desktop.removeEventListener('change', onResize);
    };
  }, [open]);

  return <header ref={headerRef} className="site-header">
    <div className="site-header-inner section-pad">
      <Link href="/" className="site-brand" aria-label={`${shopName} home`} onClick={() => setOpen(false)}>
        <span className="site-brand-mark" aria-hidden="true">TB</span>
        <span className="site-brand-name">{shopName}</span>
      </Link>
      <button ref={toggleRef} type="button" className="site-menu-toggle" aria-expanded={open} aria-controls="site-navigation" aria-label={open ? 'Close menu' : 'Open menu'} onClick={() => setOpen(value => !value)}>
        {open ? <X size={21} aria-hidden="true" /> : <Menu size={21} aria-hidden="true" />}
      </button>
      <nav id="site-navigation" className="site-navigation" data-open={open} aria-label="Main navigation">
        <ul>
          {navigationItems.map(item => {
            const active = pathname === item.href || (item.href !== '/' && pathname.startsWith(`${item.href}/`));
            return <li key={item.href}>
              <Link href={item.href} className={item.href === '/book' ? 'site-nav-link site-nav-book' : 'site-nav-link'} aria-current={active ? 'page' : undefined} onClick={() => setOpen(false)}>
                {item.label}{item.href === '/book' && <ArrowUpRight size={15} aria-hidden="true" />}
              </Link>
            </li>;
          })}
        </ul>
      </nav>
    </div>
  </header>;
}
