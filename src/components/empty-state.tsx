import type { ReactNode } from 'react';
import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';

type EmptyStateProps = {
  /** Small uppercase kicker above the title, e.g. "The service menu". */
  label?: string;
  title: string;
  description?: string;
  /** Optional call to action rendered as a button-styled link. */
  action?: { href: string; label: string };
  icon?: ReactNode;
  /** `dark` for blocks sitting on ink backgrounds (lookbook, footer areas). */
  tone?: 'light' | 'dark';
  /** Tighter padding for use inside cards or panels. */
  compact?: boolean;
  className?: string;
};

/**
 * Deliberate, on-brand placeholder for surfaces that have no published records yet.
 * The public site never invents content, so empty states are a first-class UI state.
 */
export function EmptyState({ label, title, description, action, icon, tone = 'light', compact = false, className = '' }: EmptyStateProps) {
  const dark = tone === 'dark';
  return <div
    className={[
      'relative flex flex-col items-start gap-4 border',
      compact ? 'px-5 py-6 sm:px-6 sm:py-7' : 'px-6 py-9 sm:px-9 sm:py-12',
      dark ? 'border-white/20 bg-white/[.04] text-cream' : 'border-black/20 bg-[#f7f4ee] text-ink',
      className
    ].filter(Boolean).join(' ')}
  >
    <span aria-hidden="true" className={`absolute inset-x-0 top-0 h-[3px] ${dark ? 'bg-lime/80' : 'bg-lime'}`} />
    <div className="flex w-full items-start gap-4">
      {icon && <span className={`grid size-11 shrink-0 place-items-center border ${dark ? 'border-white/25 text-lime' : 'border-black/25 text-ink'}`}>{icon}</span>}
      <div className="min-w-0 flex-1">
        {label && <p className={`label mb-2 ${dark ? 'text-white/70' : 'text-neutral-500'}`}>{label}</p>}
        <h3 className={`display text-2xl sm:text-3xl ${dark ? 'text-cream' : 'text-ink'}`}>{title}</h3>
        {description && <p className={`mt-3 max-w-xl text-xs leading-6 sm:text-sm ${dark ? 'text-white/70' : 'text-neutral-600'}`}>{description}</p>}
      </div>
    </div>
    {action && <Link href={action.href} className={`${dark ? 'btn-outline border-white text-cream hover:bg-lime hover:text-ink' : 'btn-dark'} w-full justify-center sm:w-auto`}>
      {action.label} <ArrowUpRight aria-hidden="true" size={14} />
    </Link>}
  </div>;
}
