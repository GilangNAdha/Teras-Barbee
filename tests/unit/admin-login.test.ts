import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ADMIN_LOGIN_ALIAS_DOMAIN, adminLoginEmail, adminLoginInputSchema } from '@/lib/admin-login';

const mocks = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  createSupabaseServerClient: vi.fn()
}));

vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: mocks.createSupabaseServerClient }));
vi.mock('next/navigation', () => ({
  redirect: (path: string): never => { throw new Error(`REDIRECT:${path}`); }
}));

import { signInAction } from '@/app/admin/login/actions';

function loginForm(username: string, password = 'fixture-password') {
  const form = new FormData();
  form.set('username', username);
  form.set('password', password);
  return form;
}

describe('admin username identifiers', () => {
  it('normalizes usernames to a reserved, non-deliverable Auth alias', () => {
    expect(adminLoginEmail('  Team_2026  ')).toBe(`team_2026@${ADMIN_LOGIN_ALIAS_DOMAIN}`);
    expect(adminLoginEmail('team-name')).toBe(`team-name@${ADMIN_LOGIN_ALIAS_DOMAIN}`);
  });

  it('continues to accept existing email-based accounts', () => {
    expect(adminLoginEmail(' Owner@Example.org ')).toBe('owner@example.org');
  });

  it.each(['', 'ab', '-team', 'team.name', 'team name', 'team@', 'x'.repeat(41), '<script>'])('rejects invalid identifier %s', identifier => {
    expect(adminLoginEmail(identifier)).toBeNull();
    expect(adminLoginInputSchema.safeParse({ username: identifier, password: 'fixture-password' }).success).toBe(false);
  });

  it('does not normalize the password', () => {
    expect(adminLoginInputSchema.parse({ username: ' Team ', password: '  fixture password  ' }).password).toBe('  fixture password  ');
    expect(adminLoginInputSchema.safeParse({ username: 'team', password: 'short' }).success).toBe(false);
  });
});

describe('administrator sign-in action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.signInWithPassword.mockResolvedValue({ error: null });
    mocks.createSupabaseServerClient.mockResolvedValue({ auth: { signInWithPassword: mocks.signInWithPassword } });
  });

  it('authenticates a username through Supabase without changing the password', async () => {
    await expect(signInAction(loginForm('TEAM_2026', '  fixture password  '))).rejects.toThrow('REDIRECT:/admin');
    expect(mocks.signInWithPassword).toHaveBeenCalledOnce();
    expect(mocks.signInWithPassword).toHaveBeenCalledWith({
      email: `team_2026@${ADMIN_LOGIN_ALIAS_DOMAIN}`,
      password: '  fixture password  '
    });
  });

  it('preserves existing email sign-in', async () => {
    await expect(signInAction(loginForm('owner@example.org'))).rejects.toThrow('REDIRECT:/admin');
    expect(mocks.signInWithPassword).toHaveBeenCalledWith({ email: 'owner@example.org', password: 'fixture-password' });
  });

  it('rejects invalid credentials before contacting Supabase', async () => {
    await expect(signInAction(loginForm('not a username'))).rejects.toThrow('REDIRECT:/admin/login?error=invalid');
    expect(mocks.createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it('reports missing Supabase configuration', async () => {
    mocks.createSupabaseServerClient.mockResolvedValue(null);
    await expect(signInAction(loginForm('team'))).rejects.toThrow('REDIRECT:/admin/login?error=setup');
  });

  it('returns the same generic error for failed authentication', async () => {
    mocks.signInWithPassword.mockResolvedValue({ error: { message: 'Invalid login credentials' } });
    await expect(signInAction(loginForm('team'))).rejects.toThrow('REDIRECT:/admin/login?error=credentials');
  });
});
