import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, KeyRound } from 'lucide-react';
import { signInAction } from './actions';

export const metadata: Metadata = { title: 'Admin sign in' };
const messages: Record<string, string> = {
  setup: 'Supabase is not configured yet. Follow the setup guide in README.md.',
  invalid: 'Enter a valid email and password.',
  credentials: 'Sign in failed. Check your email and password.',
  unauthorized: 'This account does not have administrator access.'
};

export default async function AdminLoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <main id="main" className="page-shell flex min-h-[75vh] items-center py-16">
    <div className="mx-auto grid w-full max-w-6xl border border-black/20 md:grid-cols-2">
      <div className="bg-ink p-8 text-cream sm:p-12"><p className="label mb-5 text-lime">Terasbarber / Admin</p><h1 className="display text-6xl sm:text-8xl">KEEP<br />IT TIGHT.</h1><p className="mt-7 max-w-sm text-sm leading-6 text-white/65">Shop operations. Appointments, services, barber profiles, and gallery content.</p></div>
      <div className="bg-cream p-8 sm:p-12"><Link className="label inline-flex min-h-11 items-center gap-2 text-neutral-500" href="/"><ArrowLeft size={13} /> Public site</Link><div className="mt-10 flex items-center gap-2"><KeyRound size={15} /><span className="label">Administrator sign in</span></div>
        {error && <p role="alert" className="mt-5 border border-red-800/20 bg-red-50 p-3 text-xs text-red-900">{messages[error] || 'Sign in could not be completed.'}</p>}
        <form action={signInAction} className="mt-6 space-y-4">
          <label className="block"><span className="label mb-2 block">Email</span><input className="form-field" name="email" type="email" autoComplete="username" required maxLength={254} /></label>
          <label className="block"><span className="label mb-2 block">Password</span><input className="form-field" name="password" type="password" autoComplete="current-password" required minLength={8} maxLength={128} /></label>
          <button className="btn-primary mt-2 w-full" type="submit">Sign in securely</button>
        </form>
        <p className="mt-5 text-[10px] leading-5 text-neutral-500">Accounts are provisioned by the project owner in Supabase. Public self-registration is disabled.</p>
      </div>
    </div>
  </main>;
}
