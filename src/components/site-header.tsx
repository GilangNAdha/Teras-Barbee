'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type CSSProperties } from 'react';
import { ArrowUpRight } from 'lucide-react';
import PillNav, { type PillNavItem } from '@/components/pill-nav';

const navigationItems: PillNavItem[] = [
  { label: 'Home', href: '/' },
  { label: 'Services', href: '/services' },
  { label: 'Barbers', href: '/barbers' },
  { label: 'Gallery', href: '/gallery' },
  { label: 'Find us', href: '/map' },
  { label: 'Book now', href: '/book', icon: <ArrowUpRight aria-hidden="true" /> }
];

// The pill row keeps its desktop look on phones: it wraps onto a second line instead of
// collapsing into a menu button. Sizes scale with the viewport so two rows stay compact.
const responsiveSizes = {
  '--pn-x': 'clamp(9px, 2.9vw, 16px)',
  '--pn-font': 'clamp(12px, 3.1vw, 14px)',
  '--pn-h': 'clamp(34px, 8.6vw, 44px)',
  '--pn-gap': 'clamp(4px, 1.4vw, 8px)',
  '--pn-item-gap': '2px'
} as CSSProperties;

export function SiteHeader({ shopName = 'TERASBARBER' }: { shopName?: string }) {
  const pathname = usePathname();
  const [activeHref, setActiveHref] = useState<string>();

  useEffect(() => {
    // Resolve the active route after hydration so rewrites cannot change the server-rendered nav tree.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActiveHref(pathname);
  }, [pathname]);
  return <header className="site-header relative z-50 border-b border-white/15 bg-ink text-cream">
    <div className="section-pad mx-auto flex min-h-[82px] max-w-[1800px] items-center justify-center py-3">
      <PillNav
        logo={<span className="site-pill-mark">TB</span>}
        logoAlt={`${shopName} home`}
        logoHref="/"
        items={navigationItems}
        activeHref={activeHref}
        linkComponent={Link}
        theme="dark"
        layout="split"
        size="md"
        surface="glass"
        itemStyle="plain"
        hoverEffect="fill"
        indicator="dot"
        highlightColor="#d7ff38"
        highlightTextColor="#111111"
        barColor="rgba(244, 240, 232, 0.12)"
        textColor="#f4f0e8"
        collapse="never"
        wrap
        ariaLabel="Main navigation"
        className="site-pill-nav"
        style={responsiveSizes}
      />
    </div>
  </header>;
}
