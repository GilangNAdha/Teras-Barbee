'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import PillNav, { type PillNavItem } from '@/components/pill-nav';
import { BrandLogo } from '@/components/brand-logo';
import { MobileSiteNav } from '@/components/mobile-site-nav';

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
    <div className="site-header-inner section-pad mx-auto min-h-[82px] max-w-[1800px]">
      <Link href="/" className="site-brand-logo" aria-label={`${shopName} home`}>
        <BrandLogo variant="light" priority className="site-brand-logo-img" />
      </Link>
      <PillNav
        items={navigationItems}
        activeHref={activeHref}
        defaultActiveIndex={-1}
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
        ariaLabel="Main navigation"
        className="site-pill-nav"
      />
      <MobileSiteNav shopName={shopName} items={navigationItems} activeHref={activeHref} />
    </div>
  </header>;
}
