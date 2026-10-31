import type { Metadata } from 'next';
import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import { ServiceMenu } from '@/components/service-menu';
import { ServiceEmptyState } from '@/components/service-empty-state';
import { SetupNotice } from '@/components/setup-notice';
import { getActiveServicesResult } from '@/lib/public-data';

export const metadata: Metadata = { title: 'Services' };
export const dynamic = 'force-dynamic';

export default async function ServicesPage() {
  const { services, error } = await getActiveServicesResult();
  return <main id="main">
    <SetupNotice />
    <section className="section-pad mx-auto max-w-[1800px] py-14 sm:py-24">
      <p className="label mb-5 text-neutral-500">01 / The menu</p><h1 className="display text-[clamp(68px,12vw,160px)]">THE<br />SERVICE<br />LIST<span className="text-lime">.</span></h1>
      <div className="mt-8 flex flex-wrap items-end justify-between gap-5 border-t border-black/20 pt-6"><p className="max-w-md text-sm leading-6 text-neutral-600">Straightforward services, clear prices, and time set aside for your cut. All prices are shown in Indonesian rupiah.</p><Link className="btn-dark" href="/book">Book a service <ArrowUpRight size={14} /></Link></div>
      {error ? <div role="alert" className="mt-12 border border-black/20 bg-white/40 p-6 text-sm leading-6"><strong>The service menu could not be loaded.</strong> Please try again in a moment. <Link href="/services" className="underline">Reload the menu</Link></div> : services.length ? <div className="mt-14"><ServiceMenu services={services} /></div> : <div className="mt-12"><ServiceEmptyState /></div>}
    </section>
  </main>;
}
