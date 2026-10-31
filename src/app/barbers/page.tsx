import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { BarberLanyardShowcase } from '@/components/barber-lanyard-showcase';
import { SetupNotice } from '@/components/setup-notice';
import { getActiveBarbers, getBarberContactLinks, getBarberServiceNames } from '@/lib/public-data';

export const metadata: Metadata = { title: 'Barbers' };
export const dynamic = 'force-dynamic';

export default async function BarbersPage() {
  const [barbers, serviceMap] = await Promise.all([getActiveBarbers(), getBarberServiceNames()]);
  const contacts = await getBarberContactLinks(barbers.map(barber => barber.id));
  const profiles = barbers.map(barber => ({ ...barber, serviceNames: serviceMap[barber.id] ?? [], contactUrl: contacts[barber.id] }));
  return <main id="main">
    <SetupNotice />
    <section className="section-pad mx-auto max-w-[1800px] py-14 sm:py-24">
      <div className="flex flex-wrap items-end justify-between gap-6"><div><p className="label mb-5 text-neutral-500">02 / The people</p><h1 className="display text-[clamp(68px,11vw,150px)]">MEET<br />YOUR<br />BARBER<span className="text-lime">.</span></h1></div><p className="max-w-xs text-sm leading-6 text-neutral-600">Good work starts with listening. Get to know the people behind the chair, then book with the right fit.</p></div>
      {profiles.length ? <div className="mt-12"><BarberLanyardShowcase barbers={profiles} /></div> : <div className="mt-14 border-y border-black/20 py-8 text-sm text-neutral-600">Bookable barber profiles are being prepared. <Link className="underline" href="/book">Check services <ArrowUpRight className="inline" size={13} /></Link></div>}
    </section>
  </main>;
}
