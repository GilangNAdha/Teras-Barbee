import type { Metadata } from 'next';
import { ArrowUpRight, Scissors } from 'lucide-react';
import Link from 'next/link';
import { ServiceMenu } from '@/components/service-menu';
import { EmptyState } from '@/components/empty-state';
import { SetupNotice } from '@/components/setup-notice';
import { getActiveServices } from '@/lib/public-data';

export const metadata: Metadata = { title: 'Services' };
export const dynamic = 'force-dynamic';

export default async function ServicesPage() {
  const services = await getActiveServices();
  return <main id="main">
    <SetupNotice />
    <section className="page-shell py-12 sm:py-20 lg:py-24">
      <p className="label mb-5 text-neutral-500">01 / The menu</p><h1 className="display text-[clamp(68px,12vw,160px)]">THE<br />SERVICE<br />LIST<span className="text-lime">.</span></h1>
      <div className="mt-8 flex flex-wrap items-end justify-between gap-5 border-t border-black/20 pt-6"><p className="max-w-md text-sm leading-6 text-neutral-600">Straightforward services, clear prices, and time set aside for your cut. All prices are shown in Indonesian rupiah.</p><Link className="btn-dark" href="/book">Book a service <ArrowUpRight size={14} /></Link></div>
      {services.length ? <div className="mt-12"><h2 className="sr-only">Published services</h2><ServiceMenu services={services} /></div> : <div className="mt-12"><EmptyState
        icon={<Scissors aria-hidden="true" size={18} />}
        label="The menu is being prepared"
        title="No services published yet."
        description="The shop publishes its real service list, prices and durations here. Nothing is invented in the meantime — check back soon, or send the shop a message to ask about a cut."
        action={{ href: '/book', label: 'Open the booking page' }}
      /></div>}
    </section>
  </main>;
}
