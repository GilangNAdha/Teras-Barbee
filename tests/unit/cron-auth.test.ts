import { afterEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { isAuthorizedCronRequest } from '@/lib/notifications/cron-auth';

const SAVED_VERCEL = process.env.VERCEL;

afterEach(() => {
  delete process.env.CRON_SECRET;
  if (SAVED_VERCEL === undefined) delete process.env.VERCEL;
  else process.env.VERCEL = SAVED_VERCEL;
});

function request(url: string, headers: Record<string, string> = {}) {
  return new NextRequest(new URL(url, 'http://localhost:3000'), { headers });
}

describe('cron endpoint authorization', () => {
  it('rejects every invocation when CRON_SECRET is not configured', () => {
    delete process.env.CRON_SECRET;
    expect(isAuthorizedCronRequest(request('http://localhost/api/cron/process-notifications'))).toBe(false);
  });

  it('accepts a correct bearer token and rejects a wrong one', () => {
    process.env.CRON_SECRET = 'cron-secret';
    expect(
      isAuthorizedCronRequest(request('http://localhost/api/cron/process-notifications', { authorization: 'Bearer cron-secret' }))
    ).toBe(true);
    expect(
      isAuthorizedCronRequest(request('http://localhost/api/cron/process-notifications', { authorization: 'Bearer wrong' }))
    ).toBe(false);
  });

  it('accepts the secret as a query parameter for Vercel Cron', () => {
    process.env.CRON_SECRET = 'cron-secret';
    expect(
      isAuthorizedCronRequest(request('http://localhost/api/cron/process-notifications?secret=cron-secret'))
    ).toBe(true);
    expect(
      isAuthorizedCronRequest(request('http://localhost/api/cron/process-notifications?secret=wrong'))
    ).toBe(false);
  });

  it('only trusts the Vercel infrastructure header on the Vercel platform', () => {
    process.env.CRON_SECRET = 'cron-secret';
    expect(
      isAuthorizedCronRequest(request('http://localhost/api/cron/process-notifications', { 'x-vercel-cron': '1' }))
    ).toBe(false);
    process.env.VERCEL = '1';
    expect(
      isAuthorizedCronRequest(request('http://localhost/api/cron/process-notifications', { 'x-vercel-cron': '1' }))
    ).toBe(true);
  });

  it('rejects unauthenticated requests', () => {
    process.env.CRON_SECRET = 'cron-secret';
    expect(isAuthorizedCronRequest(request('http://localhost/api/cron/process-notifications'))).toBe(false);
  });
});
