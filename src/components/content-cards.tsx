import Link from 'next/link';
import Image from 'next/image';
import { ArrowUpRight, Clock3, MessageCircle, Scissors } from 'lucide-react';
import type { Barber, GalleryImage, Service } from '@/lib/public-data';
import { idr, storagePublicUrl as publicImageUrl } from '@/lib/format';
import { serviceImage, serviceImageIsIllustrative } from '@/lib/service-visual';

export function ServiceCard({ service }: { service: Service }) {
  const image = serviceImage(service);
  const illustrative = serviceImageIsIllustrative(service);
  return <article className="card group border-t border-black/25 pt-5">
    <div className="image-frame relative mb-5 aspect-[16/9] bg-neutral-200"><Image src={image} alt={illustrative ? `Illustrative ${service.category.toLowerCase()} service photo` : `${service.name} service`} fill sizes="(max-width: 700px) 100vw, (max-width: 1024px) 50vw, 33vw" unoptimized className="object-cover grayscale transition-transform duration-500 group-hover:scale-105" />{illustrative && <span className="absolute bottom-3 left-3 bg-ink/85 px-2 py-1 text-[9px] font-bold uppercase tracking-[.12em] text-white">Category illustration</span>}</div>
    <div className="mb-7 flex items-center justify-between"><span className="label text-neutral-500">{String(service.duration_minutes).padStart(2, '0')} MIN</span><span className="pill">{service.category}</span><Scissors aria-hidden="true" className="text-neutral-500 transition-transform group-hover:-rotate-12" size={17} /></div>
    <h3 className="display text-3xl sm:text-4xl">{service.name}</h3>
    <p className="mt-3 min-h-12 max-w-md text-sm leading-6 text-neutral-600">{service.description}</p>
    <div className="mt-7 flex items-center justify-between border-t border-black/15 pt-4">
      <span className="font-bold text-sm">{idr(service.price_idr)}</span>
      <Link className="label inline-flex min-h-11 items-center gap-2 sm:min-h-0" href={`/book?service=${service.id}`} aria-label={`Book ${service.name}`}>Book <ArrowUpRight size={14} aria-hidden="true" /></Link>
    </div>
  </article>;
}

export function BarberCard({ barber, serviceNames = [], contactUrl }: { barber: Barber; serviceNames?: string[]; contactUrl?: string }) {
  const portrait = barber.portrait_url;
  return <article className="group">
    <div className="image-frame aspect-[4/5] bg-neutral-300">
      {portrait ? <Image src={portrait} alt={`${barber.name}, barber at Terasbarber`} width={800} height={1000} unoptimized className="object-cover" /> : <div className="grid h-full place-items-center bg-[#d8d4cc] text-center"><div><Scissors aria-hidden="true" className="mx-auto mb-3 text-neutral-500" size={27} /><span className="label text-neutral-500">Portrait coming soon</span></div></div>}
    </div>
    <div className="flex items-start justify-between gap-3 pt-4"><div><h3 className="display text-2xl">{barber.name}</h3><p className="mt-2 text-xs leading-5 text-neutral-600">{barber.bio || 'Biography coming soon.'}</p>{barber.years_experience !== null && <p className="label mt-3 text-neutral-500">{barber.years_experience} years experience</p>}</div><div className="flex shrink-0 gap-2"><Link aria-label={`Book with ${barber.name}`} href={`/book?barber=${barber.id}`} className="grid size-11 place-items-center border border-black/30 transition-colors hover:bg-lime sm:size-10"><ArrowUpRight size={15} aria-hidden="true" /></Link>{contactUrl && <a aria-label={`WhatsApp ${barber.name}`} href={`${contactUrl}?text=${encodeURIComponent(`Hi ${barber.name}, I’d like to ask about booking.`)}`} target="_blank" rel="noreferrer" className="grid size-11 place-items-center border border-black/30 transition-colors hover:bg-lime sm:size-10"><MessageCircle size={15} aria-hidden="true" /></a>}</div></div>
    {barber.specialties.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{barber.specialties.map(item => <span className="pill" key={item}>{item}</span>)}</div>}
    {serviceNames.length > 0 && <p className="label mt-3 text-neutral-500">Services: {serviceNames.join(' · ')}</p>}
    {barber.preview_cut_url && <figure className="mt-5 border-t border-black/15 pt-4"><div className="image-frame relative aspect-[16/10]"><Image src={barber.preview_cut_url} alt={`${barber.name}'s haircut preview`} fill sizes="(max-width: 700px) 100vw, 40vw" unoptimized className="object-cover grayscale" /></div><figcaption className="label mt-2 text-neutral-500">Cut preview / work by {barber.name}</figcaption></figure>}
  </article>;
}

export function GalleryTile({ image, index }: { image: GalleryImage; index: number }) {
  const url = publicImageUrl(image.storage_path);
  return <figure className={`image-frame relative bg-neutral-300 ${index % 3 === 1 ? 'aspect-[4/5] md:mt-12' : 'aspect-[4/3]'}`}>
    {url && <Image src={url} alt={image.alt_text || 'Terasbarber gallery photo'} fill sizes="(max-width: 800px) 50vw, 25vw" unoptimized />}
    {image.category && <figcaption className="absolute bottom-3 left-3 bg-lime px-2 py-1 text-[9px] font-black uppercase tracking-[.12em]">{image.category}</figcaption>}
  </figure>;
}

export function Duration({ minutes }: { minutes: number }) {
  return <span className="inline-flex items-center gap-1"><Clock3 size={12} /> {minutes} min</span>;
}
