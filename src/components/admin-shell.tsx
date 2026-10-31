import Link from 'next/link';
import { ArrowUpRight, CalendarDays, Camera, ChevronRight, CircleDollarSign, History, Scissors, Settings2, ShieldCheck, Users } from 'lucide-react';
import { signOutAction } from '@/app/admin/actions';

const nav = [
  { href: '/admin', label: 'Appointments', icon: CalendarDays },
  { href: '/admin/bookings', label: 'Booking history', icon: History },
  { href: '/admin/finance', label: 'Finance overview', icon: CircleDollarSign },
  { href: '/admin/services', label: 'Services', icon: Scissors },
  { href: '/admin/barbers', label: 'Barbers', icon: Users },
  { href: '/admin/gallery', label: 'Gallery', icon: Camera },
  { href: '/admin/settings', label: 'Shop setup', icon: Settings2 },
  { href: '/admin/security', label: 'Account security', icon: ShieldCheck }
];

export function AdminShell({ active, userLabel, children }: { active: string; userLabel: string; children: React.ReactNode }) {
  return <main id="main" className="section-pad mx-auto min-h-[76vh] max-w-[1800px] py-8 sm:py-12">
    <div className="admin-layout grid gap-8 lg:grid-cols-[230px_1fr]">
      <aside className="admin-sidebar flex flex-col gap-6 border-b border-black/20 pb-6 lg:sticky lg:top-6 lg:min-h-[calc(100vh-48px)] lg:border-b-0 lg:border-r lg:pr-6">
        <div><p className="label text-neutral-500">Terasbarber / Admin</p><p className="mt-2 text-sm font-bold">{userLabel}</p></div>
        <nav className="flex flex-wrap gap-2 lg:flex-col" aria-label="Admin navigation">
          {nav.map(item => { const Icon = item.icon; return <Link key={item.href} href={item.href} aria-current={active === item.href ? 'page' : undefined} className={`flex min-h-11 items-center gap-3 border px-3 py-3 text-xs font-bold transition-colors ${active === item.href ? 'border-ink bg-ink text-cream' : 'border-black/15 hover:border-black/50'}`}><Icon aria-hidden="true" size={15} />{item.label}{active === item.href && <ChevronRight className="ml-auto" size={13} />}</Link>; })}
        </nav>
        <div className="mt-auto flex flex-wrap items-center gap-4 text-[10px] font-bold uppercase tracking-[.12em]"><Link className="flex min-h-11 items-center gap-1 text-neutral-500 hover:text-black lg:min-h-0" href="/" target="_blank">View site <ArrowUpRight size={12} aria-hidden="true" /></Link><form action={signOutAction}><button className="min-h-11 text-neutral-500 hover:text-black lg:min-h-0" type="submit">Sign out</button></form></div>
      </aside>
      <section className="min-w-0">{children}</section>
    </div>
  </main>;
}
