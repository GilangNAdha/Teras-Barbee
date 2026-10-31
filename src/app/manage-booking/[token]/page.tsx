import type { Metadata } from 'next';
import { ManageBookingPanel } from '@/components/manage-booking-panel';

export const metadata: Metadata = {
  title: 'Manage your appointment',
  robots: { index: false, follow: false },
  referrer: 'no-referrer'
};
export const dynamic = 'force-dynamic';

export default async function ManageBookingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <main id="main" className="page-shell min-h-[70vh] py-12 sm:py-20">
    <ManageBookingPanel token={token} />
  </main>;
}
