'use client';

import { useMemo, useState } from 'react';
import { ServiceCard } from '@/components/content-cards';
import type { Service } from '@/lib/public-data';

const categories = [
  { id: 'ALL', label: 'All services' },
  { id: 'HAIRCUT', label: 'Haircut' },
  { id: 'COMBO', label: 'Combos' },
  { id: 'BEARD', label: 'Beard' }
] as const;

export function ServiceMenu({ services }: { services: Service[] }) {
  const [active, setActive] = useState<(typeof categories)[number]['id']>('ALL');
  const visible = useMemo(() => active === 'ALL' ? services : services.filter(service => service.category === active), [active, services]);
  return <div>
    <div className="mb-7 flex flex-wrap gap-2" role="group" aria-label="Filter services by category">
      {categories.map(category => <button key={category.id} type="button" onClick={() => setActive(category.id)} aria-pressed={active === category.id} className={`filter-chip ${active === category.id ? 'is-active' : ''}`}>{category.label}</button>)}
    </div>
    {visible.length ? <div className="grid gap-x-8 gap-y-12 border-t border-black/20 pt-8 sm:grid-cols-2 lg:grid-cols-3">{visible.map(service => <ServiceCard service={service} key={service.id} />)}</div> : <p className="border-y border-black/20 py-8 text-sm text-neutral-600">No services in this category have been published.</p>}
  </div>;
}
