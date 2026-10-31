import Link from 'next/link';
import Image from 'next/image';
import { ArrowUpRight, Clock3, MessageCircle, Scissors } from 'lucide-react';
import type { Barber, GalleryImage, Service } from '@/lib/public-data';
import { idr, storagePublicUrl as publicImageUrl } from '@/lib/format';
import { serviceImage, serviceImageIsIllustrative } from '@/lib/service-visual';

export function ServiceCard({ service, categoryIndex = 0, eager = false }: { service: Service; categoryIndex?: number; eager?: boolean }) {
  const image = serviceImage(service, categoryIndex);
  const illustrative = serviceImageIsIllustrative(service);
  return <article className="service-menu-card card group flex min-w-0 flex-col">
    <div className="image-frame relative aspect-[4/3] bg-neutral-200">
      <Image src={image} alt={illustrative ? `Illustrative ${service.category.toLowerCase()} service photo` : `${service.name} service`} fill sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw" loading={eager ? 'eager' : 'lazy'} unoptimized={!image.startsWith('/')} className="object-cover grayscale" />
      <span className="absolute left-3 top-3 bg-cream px-2.5 py-1.5 text-[9px] font-extrabold uppercase tracking-[.12em]">{service.category}</span>
      {illustrative && <span className="absolute bottom-3 left-3 bg-ink/85 px-2 py-1 text-[9px] font-bold uppercase tracking-[.1em] text-white">Illustrative photo</span>}
    </div>
    <div className="flex flex-1 flex-col border-x border-b border-black/15 bg-white/35 p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3"><h3 className="display min-w-0 text-3xl">{service.name}</h3><Scissors className="shrink-0 text-neutral-400" size={18} /></div>
      <p className="mt-3 flex-1 text-sm leading-6 text-neutral-600">{service.description || 'Details will be provided by the shop.'}</p>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-black/15 pt-4">
        <div><span className="block text-sm font-bold">{idr(service.price_idr)}</span><span className="mt-1 inline-flex items-center gap-1 text-xs text-neutral-500"><Clock3 size={13} /> {service.duration_minutes} min</span></div>
        <Link className="service-book-link" href={`/book?service=${service.id}`} aria-label={`Book ${service.name}`}>Book <ArrowUpRight size={14} /></Link>
      </div>
    </div>
  </article>;
}

export function BarberCard({ barber, serviceNames = [], contactUrl }: { barber: Barber; serviceNames?: string[]; contactUrl?: string }) {
  const portrait = barber.portrait_url;
  return <article className="group">
    <div className="image-frame aspect-[4/5] bg-neutral-300">
      {portrait ? <Image src={portrait} alt={`${barber.name}, barber at Terasbarber`} width={800} height={1000} unoptimized className="object-cover" /> : <div className="grid h-full place-items-center bg-[#d8d4cc] text-center"><div><Scissors className="mx-auto mb-3 text-neutral-500" size={27} /><span className="label text-neutral-500">Portrait coming soon</span></div></div>}
    </div>
    <div className="flex items-start justify-between gap-3 pt-4"><div><h3 className="display text-2xl">{barber.name}</h3><p className="mt-2 text-xs leading-5 text-neutral-600">{barber.bio || 'Biography coming soon.'}</p>{barber.years_experience !== null && <p className="label mt-3 text-neutral-500">{barber.years_experience} years experience</p>}</div><div className="flex shrink-0 gap-2"><Link aria-label={`Book with ${barber.name}`} href={`/book?barber=${barber.id}`} className="grid size-9 place-items-center border border-black/30 transition-colors hover:bg-lime"><ArrowUpRight size={15} /></Link>{contactUrl && <a aria-label={`WhatsApp ${barber.name}`} href={`${contactUrl}?text=${encodeURIComponent(`Hi ${barber.name}, I’d like to ask about booking.`)}`} target="_blank" rel="noreferrer" className="grid size-9 place-items-center border border-black/30 transition-colors hover:bg-lime"><MessageCircle size={15} /></a>}</div></div>
    {barber.specialties.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{barber.specialties.map(item => <span className="pill" key={item}>{item}</span>)}</div>}
    {serviceNames.length > 0 && <p className="label mt-3 text-neutral-500">Services: {serviceNames.join(' · ')}</p>}
    {barber.preview_cut_url && <figure className="mt-5 border-t border-black/15 pt-4"><div className="image-frame relative aspect-[16/10]"><Image src={barber.preview_cut_url} alt={`${barber.name}'s haircut preview`} fill sizes="(max-width: 700px) 100vw, 40vw" unoptimized className="object-cover grayscale" /></div><figcaption className="label mt-2 text-neutral-500">Cut preview / work by {barber.name}</figcaption></figure>}
  </article>;
}

export function GalleryTile({ image, index }: { image: GalleryImage; index: number }) {
  const url = publicImageUrl(image.storage_path);
  return <figure className={`image-frame relative bg-neutral-300 ${index % 3 === 1 ? 'aspect-[4/5] md:mt-12' : 'aspect-[4/3]'}`}>
    {url && <Image src={url} alt={image.alt_text} fill sizes="(max-width: 800px) 50vw, 25vw" unoptimized />}
    {image.category && <figcaption className="absolute bottom-3 left-3 bg-lime px-2 py-1 text-[9px] font-black uppercase tracking-[.12em]">{image.category}</figcaption>}
  </figure>;
}

export function Duration({ minutes }: { minutes: number }) {
  return <span className="inline-flex items-center gap-1"><Clock3 size={12} /> {minutes} min</span>;
}
