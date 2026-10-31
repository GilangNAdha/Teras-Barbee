import type { Metadata } from 'next';
import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import { ServiceMenu } from '@/components/service-menu';
import { SetupNotice } from '@/components/setup-notice';
import { getActiveServices } from '@/lib/public-data';

export const metadata: Metadata = { title: 'Services' };
export const dynamic = 'force-dynamic';

export default async function ServicesPage() {
  const services = await getActiveServices();
  return <main id="main">
    <SetupNotice />
    <section className="section-pad mx-auto max-w-[1600px] py-14 sm:py-24">
      <p className="label mb-5 text-neutral-500">01 / The menu</p><h1 className="display text-[clamp(68px,12vw,160px)]">THE<br />SERVICE<br />LIST<span className="text-lime">.</span></h1>
      <div className="mt-8 flex flex-wrap items-end justify-between gap-5 border-t border-black/20 pt-6"><p className="max-w-md text-sm leading-6 text-neutral-600">Straightforward services, clear prices, and time set aside for your cut. All prices are shown in Indonesian rupiah.</p><Link className="btn-dark" href="/book">Book a service <ArrowUpRight size={14} /></Link></div>
      {services.length ? <div className="mt-14"><h2 className="sr-only">Published services</h2><ServiceMenu services={services} /></div> : <div className="mt-14 border-y border-black/20 py-8 text-sm text-neutral-600">There are no published services yet. Please check back soon.</div>}
    </section>
  </main>;
}
