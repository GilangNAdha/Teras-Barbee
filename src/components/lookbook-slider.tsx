'use client';

import Image from 'next/image';
import { useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { ArrowLeft, ArrowRight, ImageOff } from 'lucide-react';

type Slide = { id: string; url: string; alt: string; category: string | null };

export function LookbookSlider({ slides: input }: { slides: Slide[] }) {
  // A published record can point at a missing storage object; drop empty sources instead of
  // rendering a broken next/image node.
  const slides = input.filter(slide => Boolean(slide.url));
  const [current, setCurrent] = useState(0);
  const swipe = useRef<{ x: number; y: number; active: boolean } | null>(null);
  const index = slides.length ? Math.min(current, slides.length - 1) : 0;
  const previous = () => setCurrent(value => (value - 1 + slides.length) % slides.length);
  const next = () => setCurrent(value => (value + 1) % slides.length);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.target instanceof HTMLElement && event.target.closest('button')) return;
    if (event.key === 'ArrowLeft') { event.preventDefault(); previous(); }
    if (event.key === 'ArrowRight') { event.preventDefault(); next(); }
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse') return;
    swipe.current = { x: event.clientX, y: event.clientY, active: true };
    // Capture so a swipe that ends outside the frame still completes (or cancels on scroll).
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = swipe.current;
    swipe.current = null;
    if (!start?.active) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    // Only treat a mostly-horizontal gesture as a swipe so vertical page scrolling still works.
    if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
    if (dx < 0) next(); else previous();
  };

  if (!slides.length) return <div className="lookbook-empty grid min-h-[310px] place-items-center border border-white/20 bg-[#181818] p-8 text-center sm:min-h-[480px]">
    <div><ImageOff className="mx-auto mb-4 text-lime" size={22} aria-hidden="true" /><p className="label text-white/70">LOOKBOOK / WAITING FOR SHOP PHOTOS</p><p className="mt-2 text-xs text-white/70">Published gallery images will show here.</p></div>
  </div>;

  const slide = slides[index];
  return <div className="lookbook-slider" role="region" aria-label="Terasbarber lookbook" aria-roledescription="carousel" tabIndex={0} onKeyDown={handleKeyDown}>
    <p className="sr-only" aria-live="polite" aria-atomic="true">{`Photo ${index + 1} of ${slides.length}: ${slide.alt}`}</p>
    <div
      className="relative aspect-[4/3] touch-pan-y overflow-hidden border border-white/15 bg-[#171717] sm:aspect-[16/9]"
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={() => { swipe.current = null; }}
      onLostPointerCapture={() => { swipe.current = null; }}
    >
      <Image key={slide.id} src={slide.url} alt={slide.alt} fill sizes="(max-width: 800px) 100vw, 70vw" unoptimized priority={index === 0} className="object-cover grayscale transition-all duration-500 hover:grayscale-0" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
      <div className="pointer-events-none absolute bottom-4 left-4 right-4 flex items-end justify-between gap-4 sm:bottom-6 sm:left-6 sm:right-6">
        <div><p className="label text-lime">{slide.category || 'TERASBARBER / ARCHIVE'}</p><p className="mt-1 max-w-2xl text-sm font-semibold text-white sm:text-lg">{slide.alt}</p></div>
        <span className="label shrink-0 bg-ink/75 px-2 py-1 text-white">{String(index + 1).padStart(2, '0')} / {String(slides.length).padStart(2, '0')}</span>
      </div>
    </div>
    <div className="flex items-center justify-between gap-3 border-x border-b border-white/15 px-2 py-2 sm:px-5 sm:py-3">
      <div className="flex flex-wrap items-center" role="group" aria-label="Choose a lookbook image">
        {slides.map((item, slideIndex) => <button key={item.id} type="button" aria-label={`Show photo ${slideIndex + 1} of ${slides.length}`} aria-pressed={slideIndex === index} onClick={() => setCurrent(slideIndex)} className="grid h-11 w-6 place-items-center sm:h-9 sm:w-auto sm:px-1"><span aria-hidden="true" className={`block h-1.5 transition-all ${slideIndex === index ? 'w-6 bg-lime sm:w-9' : 'w-3 bg-white/45 hover:bg-white/80 sm:w-4'}`} /></button>)}
      </div>
      <div className="flex shrink-0 gap-2"><button type="button" className="lookbook-control" aria-label="Previous lookbook image" onClick={previous}><ArrowLeft size={15} aria-hidden="true" /></button><button type="button" className="lookbook-control" aria-label="Next lookbook image" onClick={next}><ArrowRight size={15} aria-hidden="true" /></button></div>
    </div>
  </div>;
}
