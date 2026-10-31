'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
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

export function SiteHeader({ shopName = 'TERASBARBER' }: { shopName?: string }) {
  const pathname = usePathname();
  const [activeHref, setActiveHref] = useState<string>();

  useEffect(() => {
    // Resolve the active route after hydration so rewrites cannot change the server-rendered nav tree.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActiveHref(pathname);
  }, [pathname]);
  return <header className="site-header relative z-50 border-b border-white/15 bg-ink text-cream">
    <div className="section-pad mx-auto flex h-[82px] max-w-[1800px] items-center justify-center">
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
        collapse="auto"
        ariaLabel="Main navigation"
        className="site-pill-nav"
      />
    </div>
  </header>;
}
