import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { GalleryTile } from '@/components/content-cards';
import { SetupNotice } from '@/components/setup-notice';
import { ScrollReveal } from '@/components/scroll-reveal';
import { getGalleryImages } from '@/lib/public-data';

export const metadata: Metadata = { title: 'Gallery' };
export const dynamic = 'force-dynamic';

export default async function GalleryPage() {
  const images = await getGalleryImages();
  return <main id="main">
    <SetupNotice />
    <section className="section-pad mx-auto max-w-[1600px] py-14 sm:py-24">
      <div className="flex flex-wrap items-end justify-between gap-6"><div><p className="label mb-5 text-neutral-500">03 / The work</p><h1 className="display text-[clamp(70px,13vw,170px)]">CUTS IN<br />CONTEXT<span className="text-lime">.</span></h1></div><Link className="btn-dark" href="/book">Get in the chair <ArrowUpRight size={14} /></Link></div>
      {images.length ? <ScrollReveal stagger className="mt-14 grid grid-cols-2 items-start gap-3 border-t border-black/20 pt-8 sm:gap-5 md:grid-cols-3 lg:grid-cols-4">{images.map((image, index) => <GalleryTile key={image.id} image={image} index={index} />)}</ScrollReveal> : <div className="mt-14 border-y border-black/20 py-8 text-sm text-neutral-600">The gallery is empty for now. The shop can add approved photos from the admin dashboard.</div>}
    </section>
  </main>;
}
