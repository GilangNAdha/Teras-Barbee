'use client';

import Image from 'next/image';
import { useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { ArrowLeft, ArrowRight, ImageOff } from 'lucide-react';

type Slide = { id: string; url: string; alt: string; category: string | null };

export function LookbookSlider({ slides }: { slides: Slide[] }) {
  const [current, setCurrent] = useState(0);
  const previous = () => setCurrent(index => (index - 1 + slides.length) % slides.length);
  const next = () => setCurrent(index => (index + 1) % slides.length);
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.target instanceof HTMLElement && event.target.closest('button')) return;
    if (event.key === 'ArrowLeft') { event.preventDefault(); previous(); }
    if (event.key === 'ArrowRight') { event.preventDefault(); next(); }
  };

  if (!slides.length) return <div className="lookbook-empty grid min-h-[310px] place-items-center border border-white/20 bg-[#181818] p-8 text-center sm:min-h-[480px]">
    <div><ImageOff className="mx-auto mb-4 text-lime" size={22} /><p className="label text-white/55">LOOKBOOK / WAITING FOR SHOP PHOTOS</p><p className="mt-2 text-xs text-white/45">Published gallery images will show here.</p></div>
  </div>;

  const slide = slides[current];
  return <div className="lookbook-slider" role="region" aria-label="Terasbarber lookbook" aria-roledescription="carousel" tabIndex={0} onKeyDown={handleKeyDown}>
    <div className="relative aspect-[4/3] overflow-hidden border border-white/15 bg-[#171717] sm:aspect-[16/9]" aria-live="polite">
      <Image key={slide.id} src={slide.url} alt={slide.alt} fill sizes="(max-width: 800px) 100vw, 70vw" unoptimized priority={current === 0} className="object-cover grayscale transition-all duration-500 hover:grayscale-0" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
      <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between gap-4 sm:bottom-6 sm:left-6 sm:right-6">
        <div><p className="label text-lime">{slide.category || 'TERASBARBER / ARCHIVE'}</p><p className="mt-1 max-w-2xl text-sm font-semibold text-white sm:text-lg">{slide.alt}</p></div>
        <span className="label shrink-0 bg-ink/75 px-2 py-1 text-white">{String(current + 1).padStart(2, '0')} / {String(slides.length).padStart(2, '0')}</span>
      </div>
    </div>
    <div className="flex items-center justify-between border-x border-b border-white/15 px-3 py-3 sm:px-5">
      <div className="flex items-center gap-2" aria-label="Choose a lookbook image">{slides.map((item, index) => <button key={item.id} type="button" aria-label={`Show photo ${index + 1}`} aria-pressed={index === current} onClick={() => setCurrent(index)} className={`h-1.5 transition-all ${index === current ? 'w-9 bg-lime' : 'w-4 bg-white/30 hover:bg-white/70'}`} />)}</div>
      <div className="flex gap-2"><button type="button" className="lookbook-control" aria-label="Previous lookbook image" onClick={previous}><ArrowLeft size={15} /></button><button type="button" className="lookbook-control" aria-label="Next lookbook image" onClick={next}><ArrowRight size={15} /></button></div>
    </div>
  </div>;
}
