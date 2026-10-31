import Link from 'next/link';
import Image from 'next/image';
import { ArrowDown, ArrowRight, ArrowUpRight, MapPin } from 'lucide-react';
import { BarberCard } from '@/components/content-cards';
import { LookbookSlider } from '@/components/lookbook-slider';
import { ServiceMenu } from '@/components/service-menu';
import { SetupNotice } from '@/components/setup-notice';
import { ScrollReveal } from '@/components/scroll-reveal';
import TechText from '@/components/tech-text';
import { getActiveBarbers, getActiveServicesResult, getBarberContactLinks, getGalleryImages, getShopHours, getShopSettings, publicImageUrl } from '@/lib/public-data';

export const dynamic = 'force-dynamic';

const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const tickerPhrases = ['GOOD CUTS, GOOD COMPANY', 'TAKE YOUR TIME', 'THE CHAIR IS YOURS'];
const timeLabel = (time: string | null) => time ? time.slice(0, 5) : '—';

export default async function HomePage() {
  const [serviceResult, barberData, gallery, hours, settings] = await Promise.all([
    getActiveServicesResult(),
    getActiveBarbers().then(async barbers => ({ barbers, contacts: await getBarberContactLinks(barbers.map(barber => barber.id)) })),
    getGalleryImages(), getShopHours(), getShopSettings()
  ]);
  const { services, error: serviceError } = serviceResult;
  const { barbers, contacts: barberContacts } = barberData;
  const whatsapp = settings?.phone_whatsapp?.replace(/\D/g, '');
  const publishedHero = gallery[0] ? publicImageUrl(gallery[0].storage_path) : null;
  const heroSrc = publishedHero || '/images/barber-hero.jpg';
  const mapsUrl = [settings?.address, settings?.city].filter(Boolean).join(', ');

  return <main id="main">
    <SetupNotice />
    <section className="editorial-hero relative isolate overflow-hidden bg-ink text-cream">
      <div className="hero-backdrop pointer-events-none absolute inset-0 z-0" aria-hidden="true">
        <Image src={heroSrc} alt="" fill priority sizes="100vw" unoptimized className="object-cover grayscale" />
      </div>
      <div className="section-pad relative z-10 mx-auto max-w-[1800px]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/20 py-3 font-mono text-[9px] uppercase tracking-[.14em] text-white/55 sm:text-[10px]">
          <span><b className="mr-2 inline-block size-2 bg-lime" />TERASBARBER / CUTS, CULTURE, CRAFT</span>
          <span>{settings?.city ? settings.city.toUpperCase() : 'APPOINTMENTS BY REQUEST'}</span>
        </div>
        <div className="hero-grid border-b border-white/20">
          <div className="flex flex-col justify-between py-10 md:py-14 md:pr-12 lg:py-16">
            <p className="label text-lime">A seat. A conversation. A considered cut.</p>
            <div className="my-9">
              <h1 className="sr-only">Raw precision. Teras culture.</h1>
              <div className="hero-wordmark" aria-hidden="true">
                <TechText text="RAW" fontWeight={900} fontSize={150} letterSpacing={-0.055} align="left" color="#f4f0e8" accentColor="#d7ff38" reveal="letter" specks={10} intro="type" introDuration={1.1} selection labels={false} draggable={false} clickKick sweep={false} className="hero-wordmark-line" style={{ height: 'clamp(76px, 11vw, 145px)' }} />
                <TechText text="PRECISION." fontWeight={900} fontSize={150} letterSpacing={-0.055} align="left" color="#d7ff38" accentColor="#d7ff38" reveal="letter" specks={10} intro="type" introDuration={1.1} selection labels={false} draggable={false} clickKick sweep={false} className="hero-wordmark-line" style={{ height: 'clamp(76px, 11vw, 145px)' }} />
                <TechText text="TERAS" fontWeight={900} fontSize={150} letterSpacing={-0.055} align="left" color="#f4f0e8" accentColor="#d7ff38" reveal="letter" specks={10} intro="type" introDuration={1.1} selection labels={false} draggable={false} clickKick sweep={false} className="hero-wordmark-line" style={{ height: 'clamp(76px, 11vw, 145px)' }} />
                <TechText text="CULTURE." fontWeight={900} fontSize={150} letterSpacing={-0.055} align="left" color="#f4f0e8" accentColor="#d7ff38" reveal="letter" specks={10} intro="type" introDuration={1.1} selection labels={false} draggable={false} clickKick sweep={false} className="hero-wordmark-line" style={{ height: 'clamp(76px, 11vw, 145px)' }} />
              </div>
              <p className="mt-7 max-w-lg text-sm leading-6 text-white/65 sm:text-base">Come in for a clean cut and an unhurried reset. Choose your service, find a time that works, and we’ll take it from there.</p>
            </div>
            <div className="flex flex-wrap items-center gap-4 border-t border-white/20 pt-6">
              <Link href="/book" className="btn-primary book-chair-button">Book a chair <ArrowUpRight size={14} /></Link>
              <Link href="/services" className="label inline-flex items-center gap-2 text-white/70 hover:text-lime">The service menu <ArrowRight size={14} /></Link>
              <span className="ml-auto hidden items-center gap-2 font-mono text-[9px] uppercase tracking-wider text-white/40 sm:flex"><ArrowDown size={13} /> Scroll the archive</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <div className="ticker" aria-hidden="true"><div className="ticker-track">{[0, 1, 2, 3].map(copy => <div className="ticker-group" key={copy}>{tickerPhrases.map(phrase => <span className="ticker-item" key={phrase}>{phrase}<i>✳</i></span>)}</div>)}</div></div>

    <section id="services" className="bg-cream text-ink">
      <ScrollReveal className="section-pad mx-auto max-w-[1800px] py-16 sm:py-24">
        <div className="mb-9 flex flex-wrap items-end justify-between gap-5"><div><p className="label mb-4 text-neutral-500">01 / The service menu</p><h2 className="display text-5xl sm:text-7xl">ENGINEERED<br />GROOMING<span className="text-lime">.</span></h2></div><Link href="/services" className="label inline-flex items-center gap-2 border-b border-black/30 pb-2">Full menu <ArrowUpRight size={14} /></Link></div>
        {serviceError ? <p role="alert" className="border-y border-black/20 py-7 text-sm text-neutral-600">The service menu could not be loaded. <Link href="/services" className="underline underline-offset-2">Try the full menu</Link>.</p> : services.length ? <ServiceMenu services={services} /> : <p className="border-y border-black/20 py-7 text-sm text-neutral-600">Published services will appear here when the shop adds its menu.</p>}
      </ScrollReveal>
    </section>

    <section id="lookbook" className="border-y border-white/15 bg-ink text-cream">
      <ScrollReveal className="section-pad mx-auto max-w-[1800px] py-16 sm:py-24">
        <div className="mb-9 grid gap-5 md:grid-cols-[1fr_.7fr] md:items-end"><div><p className="label mb-4 text-lime">02 / Visual archive</p><h2 className="display text-5xl sm:text-7xl">THE TERAS<br />LOOKBOOK<span className="text-lime">.</span></h2></div><p className="max-w-md text-sm leading-6 text-white/60">A changing record of the cuts and people who come through. Photos appear here only after the shop publishes them.</p></div>
        <LookbookSlider slides={gallery.map(image => ({ id: image.id, url: publicImageUrl(image.storage_path) || '', alt: image.alt_text, category: image.category }))} />
      </ScrollReveal>
    </section>

    <section id="barbers" className="bg-cream text-ink">
      <ScrollReveal className="section-pad mx-auto max-w-[1800px] py-16 sm:py-24">
        <div className="mb-10 flex flex-wrap items-end justify-between gap-5"><div><p className="label mb-4 text-neutral-500">03 / The people</p><h2 className="display text-5xl sm:text-7xl">RESIDENT<br />BARBERS<span className="text-lime">.</span></h2></div><Link href="/barbers" className="label inline-flex items-center gap-2 border-b border-black/30 pb-2">Meet the team <ArrowUpRight size={14} /></Link></div>
        {barbers.length ? <div className="grid gap-7 sm:grid-cols-2 lg:grid-cols-4">{barbers.slice(0, 4).map(barber => <BarberCard key={barber.id} barber={barber} contactUrl={barberContacts[barber.id]} />)}</div> : <p className="border-y border-black/20 py-7 text-sm text-neutral-600">Barber profiles will appear once the shop publishes them.</p>}
      </ScrollReveal>
    </section>

    <section className="border-t border-white/15 bg-[#171717] text-cream">
      <ScrollReveal className="section-pad mx-auto grid max-w-[1800px] gap-12 py-16 md:grid-cols-[.8fr_1.2fr] md:py-24">
        <div><p className="label mb-4 text-lime">Come through</p><h2 className="display text-5xl sm:text-7xl">BOOK THE<br />NEXT CHAIR<span className="text-lime">.</span></h2><p className="mt-5 max-w-sm text-sm leading-6 text-white/60">Select a service and available time. Your appointment stays pending until the shop confirms it.</p><Link href="/book" className="btn-primary mt-7">Check availability <ArrowUpRight size={14} /></Link></div>
        <div className="grid gap-0 border-y border-white/20 sm:grid-cols-2">
          <div className="border-b border-white/20 py-6 sm:border-b-0 sm:border-r sm:pr-8"><MapPin size={17} className="text-lime" /><p className="label mt-5 text-white/45">Find the shop</p><p className="mt-2 text-sm leading-6">{[settings?.address, settings?.city].filter(Boolean).join(', ') || 'Address details will be published by the shop.'}</p>{mapsUrl && <a className="label mt-4 inline-flex items-center gap-2 border-b border-white/30 pb-2 hover:text-lime" href={`https://maps.google.com/?q=${encodeURIComponent(mapsUrl)}`} target="_blank" rel="noreferrer">Open map <ArrowUpRight size={12} /></a>}</div>
          <div className="py-6 sm:pl-8"><p className="label text-white/45">Opening hours</p>{hours.length ? <ul className="mt-4 space-y-2">{hours.map(item => <li className="flex justify-between gap-3 text-xs" key={item.day_of_week}><span>{dayNames[item.day_of_week]}</span><span className="font-semibold">{item.is_closed ? 'Closed' : `${timeLabel(item.opens_at)} — ${timeLabel(item.closes_at)}`}</span></li>)}</ul> : <p className="mt-4 text-sm text-white/60">Hours are being set up.</p>}{whatsapp && <a className="label mt-5 inline-flex items-center gap-2 border-b border-white/30 pb-2 hover:text-lime" href={`https://wa.me/${whatsapp}`} target="_blank" rel="noreferrer">WhatsApp the shop <ArrowUpRight size={13} /></a>}</div>
        </div>
      </ScrollReveal>
    </section>
  </main>;
}
