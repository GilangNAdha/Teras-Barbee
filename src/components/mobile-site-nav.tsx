'use client';

import Link from 'next/link';
import { useCallback, useEffect, useId, useRef } from 'react';
import type { PillNavItem } from '@/components/pill-nav';

interface MobileSiteNavProps {
  shopName: string;
  items: PillNavItem[];
  activeHref?: string;
}

export function MobileSiteNav({ shopName, items, activeHref }: MobileSiteNavProps) {
  const navRef = useRef<HTMLElement>(null);
  const menuRef = useRef<HTMLDetailsElement>(null);
  const menuId = useId();

  const closeMenu = useCallback(() => {
    if (menuRef.current) menuRef.current.open = false;
  }, []);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (menuRef.current?.open && event.target instanceof Node && !navRef.current?.contains(event.target)) closeMenu();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !menuRef.current?.open) return;
      event.preventDefault();
      closeMenu();
      menuRef.current?.querySelector('summary')?.focus();
    };
    const desktop = window.matchMedia('(min-width: 768px)');
    const onBreakpointChange = (event: MediaQueryListEvent) => {
      if (event.matches) closeMenu();
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    desktop.addEventListener('change', onBreakpointChange);
    if (desktop.matches) closeMenu();
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      desktop.removeEventListener('change', onBreakpointChange);
    };
  }, [closeMenu]);

  return (
    <nav ref={navRef} className="site-mobile-nav" aria-label="Main navigation">
      <Link href="/" className="site-mobile-logo" aria-label={`${shopName} home`} onClick={closeMenu}>
        <span className="site-pill-mark">TB</span>
      </Link>
      {/* A visitor may open this native control before React hydrates; keep that choice. */}
      <details ref={menuRef} className="site-mobile-menu" suppressHydrationWarning>
        <summary className="site-mobile-menu-toggle" aria-controls={menuId}>
          <span className="site-mobile-menu-icon" aria-hidden="true"><span /><span /></span>
          <span className="sr-only site-mobile-menu-open">Open menu</span>
          <span className="sr-only site-mobile-menu-close">Close menu</span>
        </summary>
        <ul id={menuId} className="site-mobile-menu-panel">
          {items.map(item => item.href && (
            <li key={item.href}>
              <Link href={item.href} aria-label={item.ariaLabel} aria-current={item.href === activeHref ? 'page' : undefined} onClick={closeMenu}>
                {item.label}{item.icon}
              </Link>
            </li>
          ))}
        </ul>
      </details>
    </nav>
  );
}
