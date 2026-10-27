import 'server-only';

import { timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { getCronSecret } from '@/lib/env';

function safeCompare(provided: string, expected: string) {
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  if (providedBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(providedBuffer, expectedBuffer);
}

// Scheduled routes accept either:
//   1. Authorization: Bearer <CRON_SECRET> (recommended for external schedulers),
//   2. ?secret=<CRON_SECRET> (Vercel Cron cannot attach custom headers),
//   3. Vercel's own x-vercel-cron infrastructure header, only when actually
//      running on the Vercel platform and a secret is configured.
export function isAuthorizedCronRequest(request: NextRequest): boolean {
  const secret = getCronSecret();
  if (!secret) return false;

  const authorization = request.headers.get('authorization');
  if (authorization && safeCompare(authorization, `Bearer ${secret}`)) return true;

  const querySecret = request.nextUrl.searchParams.get('secret');
  if (querySecret && safeCompare(querySecret, secret)) return true;

  return request.headers.get('x-vercel-cron') === '1' && process.env.VERCEL === '1';
}
