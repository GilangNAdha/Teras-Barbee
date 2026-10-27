import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, ArrowUpRight, Clock3, MapPin, Navigation } from 'lucide-react';
import { SetupNotice } from '@/components/setup-notice';
import { getShopHours, getShopSettings } from '@/lib/public-data';

export const metadata: Metadata = { title: 'Find the shop' };
export const dynamic = 'force-dynamic';

const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const clock = (time: string | null) => time?.slice(0, 5) || '—';

export default async function MapPage() {
  const [settings, hours] = await Promise.all([getShopSettings(), getShopHours()]);
  const address = [settings?.address, settings?.city].filter(Boolean).join(', ');
  const mapQuery = address ? encodeURIComponent(address) : null;
  const whatsapp = settings?.phone_whatsapp?.replace(/\D/g, '');

  return <main id="main">
    <SetupNotice />
    <section className="section-pad mx-auto max-w-[1600px] py-12 sm:py-20">
      <Link href="/" className="label mb-10 inline-flex items-center gap-2 text-neutral-500"><ArrowLeft size={13} /> Back to Terasbarber</Link>
      <div className="mb-10 grid gap-8 border-b border-black/20 pb-8 md:grid-cols-[1fr_.65fr] md:items-end">
        <div><p className="label mb-5 text-neutral-500">Find your way / Terasbarber</p><h1 className="display text-[clamp(72px,12vw,160px)]">COME<br />THROUGH<span className="text-lime">.</span></h1></div>
        <div><p className="max-w-md text-sm leading-6 text-neutral-600">Use the verified shop details below to plan your visit. Address and map details are added by the shop administrator.</p>{address && <p className="mt-5 flex items-start gap-3 text-sm"><MapPin className="mt-0.5 shrink-0" size={16} /><span>{address}</span></p>}</div>
      </div>

      {mapQuery ? <div className="grid gap-8 lg:grid-cols-[1.5fr_.7fr]">
        <div className="map-frame overflow-hidden border border-black/20 bg-[#dedbd3]">
          <iframe title={`Map showing Terasbarber at ${address}`} src={`https://maps.google.com/maps?q=${mapQuery}&output=embed`} loading="lazy" referrerPolicy="no-referrer-when-downgrade" className="h-[360px] w-full border-0 sm:h-[500px]" allowFullScreen />
        </div>
        <aside className="flex flex-col justify-between border-y border-black/20 py-6">
          <div><p className="label mb-5 flex items-center gap-2 text-neutral-500"><Clock3 size={14} /> Shop hours</p>{hours.length ? <ul className="space-y-3">{hours.map(item => <li key={item.day_of_week} className="flex justify-between gap-4 border-b border-black/10 pb-3 text-xs"><span>{weekdays[item.day_of_week]}</span><span className="font-semibold">{item.is_closed ? 'Closed' : `${clock(item.opens_at)} — ${clock(item.closes_at)}`}</span></li>)}</ul> : <p className="text-sm text-neutral-600">Opening hours will be published by the shop.</p>}</div>
          <div className="mt-8 flex flex-wrap gap-3"><a className="btn-dark" href={`https://maps.google.com/?q=${mapQuery}`} target="_blank" rel="noreferrer">Open directions <Navigation size={14} /></a>{whatsapp && <a className="btn-outline" href={`https://wa.me/${whatsapp}`} target="_blank" rel="noreferrer">Ask the shop <ArrowUpRight size={14} /></a>}</div>
        </aside>
      </div> : <div className="grid min-h-[340px] place-items-center border border-dashed border-black/30 bg-[#e9e5dd] px-6 py-12 text-center sm:min-h-[440px]">
        <div className="max-w-md"><MapPin size={25} className="mx-auto mb-4 text-neutral-500" /><p className="label text-neutral-500">Location not published yet</p><p className="mt-3 text-sm leading-6 text-neutral-600">The shop hasn’t added a verified address. The map will appear here as soon as it’s configured.</p><Link href="/book" className="btn-dark mt-6">Book a chair <ArrowUpRight size={14} /></Link></div>
      </div>}
    </section>
  </main>;
}
