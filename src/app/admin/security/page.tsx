import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { AdminShell } from '@/components/admin-shell';
import { AdminSecurityPanel } from '@/components/admin-security-panel';
import { requireAdmin } from '@/lib/auth';

export const metadata: Metadata = { title: 'Account security' };
export const dynamic = 'force-dynamic';

export default async function AdminSecurityPage({ searchParams }: { searchParams: Promise<{ verify?: string }> }) {
  const [{ verify }, auth] = await Promise.all([searchParams, requireAdmin({ skipMfaCheck: true })]);
  return <AdminShell active="/admin/security" userLabel={auth.profile.full_name || auth.user.email || 'Administrator'}>
    <p className="label mb-3 text-neutral-500">Administrator account</p><div className="flex items-center gap-3"><ShieldCheck size={24} /><h1 className="display text-5xl sm:text-7xl">SECURITY.</h1></div>
    <p className="mt-4 max-w-2xl text-sm leading-6 text-neutral-600">Update this account’s password and set up authenticator-based two-factor verification. Never share passwords or one-time codes.</p>
    <div className="mt-8"><AdminSecurityPanel requireChallenge={verify === '1'} /></div>
    {verify !== '1' && <Link href="/admin" className="label mt-8 inline-flex items-center gap-2 text-neutral-600 hover:text-black"><ArrowLeft size={13} /> Back to dashboard</Link>}
  </AdminShell>;
}
