import type { Metadata, Viewport } from 'next';
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

// Zoom stays enabled (no maximumScale/user-scalable) so mobile users can pinch to read.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#111111'
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const settings = await getShopSettings();
  return <html lang="en"><body>
    <SiteHeader shopName={settings?.shop_name || 'TERASBARBER'} />
    {children}
    <SiteFooter settings={settings} />
  </body></html>;
}
