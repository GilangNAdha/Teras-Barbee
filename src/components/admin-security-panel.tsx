'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

type Factor = { id: string; friendly_name?: string | null; status: string; factor_type: string };
type PendingTotp = { id: string; qrCode: string; secret: string; uri: string };
type Mode = 'enable' | 'challenge' | 'disable';

export function AdminSecurityPanel({ requireChallenge = false }: { requireChallenge?: boolean }) {
  const [factors, setFactors] = useState<Factor[]>([]);
  const [pending, setPending] = useState<PendingTotp | null>(null);
  const [mode, setMode] = useState<Mode | null>(null);
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const verifiedFactors = factors.filter(factor => factor.factor_type === 'totp' && factor.status === 'verified');

  async function refreshFactors() {
    if (!supabase) return;
    const { data, error: factorError } = await supabase.auth.mfa.listFactors();
    if (factorError) { setError('Could not refresh two-factor settings.'); return; }
    setFactors(data.all as Factor[]);
  }

  useEffect(() => {
    let active = true;
    async function loadFactors() {
      if (!supabase) return;
      const { data, error: factorError } = await supabase.auth.mfa.listFactors();
      if (!active) return;
      if (factorError) setError('Could not load two-factor settings. Check the Supabase Auth configuration.');
      else setFactors(data.all as Factor[]);
    }
    void loadFactors();
    return () => { active = false; };
  }, [supabase]);

  function clearNotice() { setError(''); setMessage(''); }

  async function beginEnrollment() {
    clearNotice();
    if (!supabase) { setError('Authentication is not configured.'); return; }
    setBusy(true);
    const { data, error: enrollError } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Terasbarber admin authenticator' });
    setBusy(false);
    if (enrollError) { setError(enrollError.message); return; }
    setPending({ id: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret, uri: data.totp.uri });
    setMode(null);
  }

  function beginVerification(nextMode: Mode) {
    clearNotice();
    if (!supabase) { setError('Authentication is not configured.'); return; }
    if (nextMode === 'disable' && !verifiedFactors[0]) return;
    if (nextMode === 'enable' && !pending) return;
    setMode(nextMode);
    setCode('');
    if (nextMode === 'challenge') setBusy(false);
  }

  async function cancelFlow() {
    if (supabase && pending && mode === 'enable') {
      setBusy(true);
      const { error: cancelError } = await supabase.auth.mfa.unenroll({ factorId: pending.id });
      setBusy(false);
      if (cancelError) { setError('Could not cancel this authenticator enrollment.'); return; }
    }
    setMode(null);
    setCode('');
    setPending(null);
  }

  async function submitCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearNotice();
    if (!supabase || !/^\d{6,8}$/.test(code)) { setError('Enter the current 6–8 digit authenticator code.'); return; }
    const factorId = mode === 'enable' ? pending?.id : verifiedFactors[0]?.id;
    if (!factorId) { setError('No authenticator factor is available.'); return; }
    setBusy(true);
    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
    if (challengeError) { setBusy(false); setError(challengeError.message); return; }
    const { error: verifyError } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.id, code: code.trim() });
    if (verifyError) { setBusy(false); setError('That code could not be verified. Check your device time and try again.'); return; }

    if (mode === 'disable') {
      const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId });
      if (unenrollError) { setBusy(false); setError(unenrollError.message); return; }
      setMessage('Two-factor authentication has been turned off.');
      setMode(null);
      await refreshFactors();
    } else {
      setMessage(mode === 'enable' ? 'Two-factor authentication is active on this account.' : 'Additional sign-in verified.');
      if (mode === 'enable') setPending(null);
      setMode(null);
      await refreshFactors();
      if (mode === 'enable' || requireChallenge) router.replace('/admin');
    }
    setBusy(false);
  }

  async function changePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearNotice();
    if (!supabase) { setError('Authentication is not configured.'); return; }
    if (newPassword.length < 12) { setError('Use a password with at least 12 characters.'); return; }
    if (newPassword !== confirmPassword) { setError('The new passwords do not match.'); return; }
    setBusy(true);
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    setBusy(false);
    if (updateError) { setError(updateError.message); return; }
    setNewPassword('');
    setConfirmPassword('');
    setPasswordSaved(true);
    setMessage('Password updated. Use the new password next time you sign in.');
  }

  const existingFactor = verifiedFactors[0];
  const prompt = mode === 'enable' ? 'Verify authenticator setup' : mode === 'disable' ? 'Verify before disabling' : 'Verify sign-in';

  return <div className="space-y-6">
    {requireChallenge && <section className="border-2 border-ink bg-lime/30 p-5 sm:p-6"><p className="label">Step-up verification required</p><h2 className="display mt-3 text-3xl">CONFIRM IT’S YOU.</h2><p className="mt-3 text-sm leading-6">Your account has two-factor authentication enabled. Enter a code from your authenticator app to continue to the admin dashboard.</p>{existingFactor && mode !== 'challenge' && <button className="btn-dark mt-5" type="button" onClick={() => beginVerification('challenge')}>Enter authenticator code</button>}</section>}

    {error && <p role="alert" className="border border-red-800/20 bg-red-50 p-3 text-xs text-red-900">{error}</p>}
    {message && <p role="status" className="border border-green-800/20 bg-green-50 p-3 text-xs">{message}</p>}

    {mode && <form onSubmit={submitCode} className="border border-black/20 p-5 sm:p-6"><p className="label">{prompt}</p><p className="mt-3 text-sm leading-6">Enter the current code from your authenticator app. Codes refresh every few seconds.</p><label className="mt-5 block max-w-xs"><span className="label mb-2 block">Authentication code</span><input className="form-field" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,8}" minLength={6} maxLength={8} value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 8))} required /></label><div className="mt-4 flex flex-wrap gap-3"><button className="btn-primary" type="submit" disabled={busy}>{busy ? 'Checking…' : 'Verify code'}</button><button className="btn-outline" type="button" disabled={busy} onClick={() => void cancelFlow()}>Cancel</button></div></form>}

    {pending && <section className="border border-black/20 p-5 sm:p-6"><p className="label">Scan with an authenticator app</p><div className="mt-5 grid gap-5 sm:grid-cols-[180px_1fr] sm:items-center"><div className="grid min-h-44 place-items-center border border-black/10 bg-white p-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- Supabase returns a short-lived data-URL QR code. */}
          <img src={pending.qrCode} alt="Authenticator setup QR code" className="h-40 w-40" />
        </div><div><p className="text-sm leading-6">Scan this QR code in your authenticator, then verify the generated code. If you cannot scan it, enter this setup key manually:</p><code className="mt-3 block break-all bg-black/5 p-3 text-xs font-bold tracking-wider">{pending.secret}</code><div className="mt-5 flex flex-wrap gap-3"><button className="btn-primary" type="button" onClick={() => beginVerification('enable')}>I’ve added the account</button><button className="btn-outline" type="button" disabled={busy} onClick={() => void cancelFlow()}>Cancel setup</button></div></div></div></section>}

    {!requireChallenge && <div className="grid gap-6 xl:grid-cols-2">
      <section className="border border-black/20 p-5 sm:p-6"><p className="label text-neutral-500">Account password</p><h2 className="display mt-3 text-3xl">CHANGE PASSWORD</h2><p className="mt-3 text-xs leading-5 text-neutral-500">Use a unique password of at least 12 characters. Password changes require a valid authenticated admin session.</p>{passwordSaved && <p className="sr-only">Password successfully changed.</p>}<form onSubmit={changePassword} className="mt-5 space-y-4"><label className="block"><span className="label mb-2 block">New password</span><input className="form-field" type="password" autoComplete="new-password" minLength={12} maxLength={128} value={newPassword} onChange={event => setNewPassword(event.target.value)} required /></label><label className="block"><span className="label mb-2 block">Confirm new password</span><input className="form-field" type="password" autoComplete="new-password" minLength={12} maxLength={128} value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} required /></label><button className="btn-dark" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Update password'}</button></form></section>
      <section className="border border-black/20 p-5 sm:p-6"><p className="label text-neutral-500">Multi-factor authentication</p><h2 className="display mt-3 text-3xl">TWO-FACTOR</h2><p className="mt-3 text-xs leading-5 text-neutral-500">Add an authenticator app (TOTP) as a second sign-in step for this administrator account.</p>{existingFactor ? <><p className="mt-5 border border-green-900/20 bg-green-50 p-3 text-xs">Active · {existingFactor.friendly_name || 'Authenticator app'}</p><button className="btn-outline mt-5" type="button" disabled={busy} onClick={() => beginVerification('disable')}>Turn off two-factor</button></> : <button className="btn-primary mt-5" type="button" disabled={busy || !!pending} onClick={() => void beginEnrollment()}>{busy ? 'Starting…' : 'Set up authenticator'}</button>}</section>
    </div>}
    {requireChallenge && mode === 'challenge' && !error && <p className="text-xs text-neutral-500">Complete verification above. If your authenticator is unavailable, contact the project owner to recover access from Supabase Auth.</p>}
  </div>;
}
