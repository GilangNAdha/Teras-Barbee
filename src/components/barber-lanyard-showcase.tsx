'use client';

import dynamic from 'next/dynamic';
import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { ArrowUpRight, MessageCircle, Scissors } from 'lucide-react';
import type { Barber } from '@/lib/public-data';

const Lanyard = dynamic(() => import('@/components/lanyard'), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-center"><span className="label text-white/70">Preparing the barber card…</span></div>
});

type Profile = Barber & { serviceNames: string[]; contactUrl?: string };

function escapeXml(value: string) {
  return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char] || char);
}

function badgeArtwork(barber: Profile) {
  const name = escapeXml(barber.name.toUpperCase());
  const experience = barber.years_experience === null ? 'TERASBARBER / BARBER' : `${barber.years_experience} YEARS EXPERIENCE`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="1012" viewBox="0 0 720 1012"><rect width="720" height="1012" fill="#f4f0e8"/><rect x="34" y="34" width="652" height="944" fill="none" stroke="#111111" stroke-width="4"/><rect x="34" y="34" width="652" height="20" fill="#d7ff38"/><text x="72" y="130" font-family="Arial,sans-serif" font-size="25" font-weight="700" letter-spacing="6" fill="#5d5a55">TERASBARBER / RESIDENT BARBER</text><path d="M72 170h576" stroke="#111" stroke-width="2" opacity=".3"/><text x="72" y="720" font-family="Arial,sans-serif" font-size="58" font-weight="900" letter-spacing="-2" fill="#111">${name}</text><text x="74" y="778" font-family="Arial,sans-serif" font-size="22" font-weight="700" letter-spacing="4" fill="#67635d">${escapeXml(experience)}</text><path d="M72 840h576" stroke="#111" stroke-width="2" opacity=".3"/><text x="72" y="902" font-family="Arial,sans-serif" font-size="20" font-weight="700" letter-spacing="5" fill="#111">GOOD CUTS / GOOD COMPANY</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function BarberLanyardShowcase({ barbers }: { barbers: Profile[] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  if (!barbers.length) return null;
  const barber = barbers[activeIndex] || barbers[0];
  const cardFront = barber.portrait_url || badgeArtwork(barber);
  const cardBack = barber.preview_cut_url || undefined;
  const whatsappHref = barber.contactUrl ? `${barber.contactUrl}?text=${encodeURIComponent(`Hi ${barber.name}, I’d like to ask about booking.`)}` : null;

  return <section className="barber-showcase border-y border-black/20" aria-label="Resident barber profiles">
    <div className="grid lg:grid-cols-[.9fr_1.1fr]">
      <div className="relative min-h-[440px] overflow-hidden bg-ink text-cream sm:min-h-[560px]">
        <div className="absolute left-5 right-5 top-5 z-10 flex items-center justify-between"><span className="label text-lime">Terasbarber / Staff pass</span><span className="label text-white/70">{String(activeIndex + 1).padStart(2, '0')} / {String(barbers.length).padStart(2, '0')}</span></div>
        <div className="absolute inset-x-0 bottom-8 top-12" aria-hidden="true"><Lanyard frontImage={cardFront} backImage={cardBack} imageFit="cover" cardColor="#F4F0E8" orientation="portrait" finish="matte" cornerRadius={0.16} size={0.58} strapLength={0.48} strapColor="#D7FF38" strapWidth={0.72} metal="graphite" gravity={0.45} damping={0.75} elasticity={0.35} breeze={0.14} intro={false} interactive /></div>
        <p className="pointer-events-none absolute bottom-3 left-5 right-5 z-10 text-center font-mono text-[10px] uppercase tracking-[.13em] text-white/75">Drag to swing · tap the pass to flip to a cut preview</p>
      </div>

      <div className="flex min-w-0 flex-col justify-between bg-cream p-6 sm:p-10 lg:p-12">
        <div aria-live="polite" aria-atomic="true">
          <p className="label mb-4 text-neutral-500">Resident barber / {String(activeIndex + 1).padStart(2, '0')}</p>
          <h2 className="display text-5xl sm:text-7xl">{barber.name}<span className="text-lime">.</span></h2>
          <p className="mt-5 max-w-xl text-sm leading-6 text-neutral-600">{barber.bio || 'Profile details will be added by the shop.'}</p>
          <div className="mt-7 grid gap-4 border-y border-black/15 py-5 sm:grid-cols-2">
            <div><p className="label text-neutral-500">Experience</p><p className="mt-2 text-sm font-semibold">{barber.years_experience === null ? 'Not listed' : `${barber.years_experience} ${barber.years_experience === 1 ? 'year' : 'years'} behind the chair`}</p></div>
            <div><p className="label text-neutral-500">Services</p><p className="mt-2 text-sm font-semibold">{barber.serviceNames.length ? barber.serviceNames.join(' · ') : 'No services listed'}</p></div>
          </div>
          {barber.specialties.length > 0 && <div className="mt-5 flex flex-wrap gap-2">{barber.specialties.map(item => <span className="pill" key={item}>{item}</span>)}</div>}
        </div>

        <div className="mt-8 grid gap-5 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <p className="label mb-3 text-neutral-500">Cut preview / {barber.preview_cut_url ? 'Barber supplied' : 'Not published'}</p>
            {barber.preview_cut_url ? <div className="image-frame relative aspect-[16/10] max-w-lg bg-neutral-200"><Image src={barber.preview_cut_url} alt={`${barber.name}'s haircut preview`} fill sizes="(max-width: 640px) 100vw, 35vw" unoptimized className="object-cover grayscale" /></div> : <div className="grid aspect-[16/10] max-w-lg place-items-center border border-dashed border-black/25 bg-[#ebe7df] px-5 text-center"><div><Scissors aria-hidden="true" size={19} className="mx-auto mb-3 text-neutral-500" /><p className="text-xs text-neutral-600">A cut preview will appear when the shop adds a verified photo.</p></div></div>}
          </div>
          <div className="flex flex-wrap gap-2 sm:flex-col">
            <Link href={`/book?barber=${barber.id}`} className="btn-primary">Book {barber.name.split(' ')[0]} <ArrowUpRight aria-hidden="true" size={14} /></Link>
            {whatsappHref ? <a href={whatsappHref} target="_blank" rel="noreferrer" className="btn-outline"><MessageCircle aria-hidden="true" size={14} /> Contact barber</a> : <span className="max-w-44 text-xs leading-5 text-neutral-600">Contact details are available after the shop adds this barber’s public WhatsApp.</span>}
          </div>
        </div>
      </div>
    </div>

    {barbers.length > 1 && <nav className="flex flex-wrap gap-2 border-t border-black/20 bg-cream p-4 sm:p-5" aria-label="Choose a barber">{barbers.map((item, index) => <button key={item.id} type="button" aria-pressed={index === activeIndex} onClick={() => setActiveIndex(index)} className={`filter-chip ${index === activeIndex ? 'is-active' : ''}`}>{item.name}</button>)}</nav>}
  </section>;
}
