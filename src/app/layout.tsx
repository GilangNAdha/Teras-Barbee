import type { Metadata } from 'next';
import './globals.css';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import { getShopSettings } from '@/lib/public-data';

export const metadata: Metadata = {
  title: { default: 'Terasbarber — Good Cuts, No Shortcuts', template: '%s — Terasbarber' },
  description: 'A barbershop built around considered cuts, skilled hands, and a good seat.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'),
  openGraph: { type: 'website', siteName: 'Terasbarber', title: 'Terasbarber — Good Cuts, No Shortcuts', description: 'Find your next good cut.' }
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const settings = await getShopSettings();
  return <html lang="en"><body>
    <a className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:bg-lime focus:p-3" href="#main">Skip to content</a>
    <SiteHeader shopName={settings?.shop_name || 'TERASBARBER'} />
    {children}
    <SiteFooter settings={settings} />
  </body></html>;
}
