import Image from 'next/image';
import Link from 'next/link';
import { ArrowUpRight, Scissors } from 'lucide-react';

const categories = [
  { label: 'Haircut', image: '/images/service-haircut-detail.jpg' },
  { label: 'Combo', image: '/images/service-combo-detail.jpg' },
  { label: 'Beard', image: '/images/service-beard-detail.jpg' }
];

/** An honest editorial placeholder: these are categories, not bookable services. */
export function ServiceEmptyState() {
  return <section className="service-empty-state" aria-labelledby="service-empty-heading">
    <div className="service-empty-copy">
      <span className="service-empty-icon"><Scissors size={19} /></span>
      <p className="label mt-6 text-neutral-500">The menu / coming soon</p>
      <h2 id="service-empty-heading" className="display mt-3 text-3xl">A LITTLE MORE<br />OFF THE TOP<span className="text-lime">.</span></h2>
      <p className="mt-4 max-w-sm text-sm leading-6 text-neutral-600">There are no published services yet. The shop is putting the finishing touches on the menu. Check back soon for services, prices and durations.</p>
      <Link href="/barbers" className="service-empty-link">Meet the barbers <ArrowUpRight size={14} /></Link>
    </div>
    <div className="service-empty-photos" aria-label="Illustrative service categories">
      {categories.map((category, index) => <figure key={category.label} className="min-w-0">
        <div className="image-frame relative aspect-[3/4] bg-neutral-300"><Image src={category.image} alt="" fill sizes="(max-width: 640px) 30vw, 20vw" loading={index === 0 ? 'eager' : 'lazy'} className="object-cover grayscale" /></div>
        <figcaption className="mt-3 flex items-center justify-between gap-1"><span className="label">{category.label}</span><span className="font-mono text-[10px] text-neutral-400">0{index + 1}</span></figcaption>
      </figure>)}
      <p className="col-span-3 mt-1 text-[10px] leading-4 text-neutral-500">Illustrative photography. Actual services will be shown once published.</p>
    </div>
  </section>;
}
