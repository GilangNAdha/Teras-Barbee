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
  return <main id="main" className="section-pad mx-auto min-h-[70vh] max-w-[1100px] py-12 sm:py-20">
    <ManageBookingPanel token={token} />
  </main>;
}
