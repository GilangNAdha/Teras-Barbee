import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';

export const manageTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

export const manageBookingRequestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('cancel'), reason: z.string().trim().max(300).optional().default('') }).strict(),
  z.object({ action: z.literal('reschedule'), startsAt: z.iso.datetime({ offset: true }) }).strict()
]);

export function createManageToken() {
  return randomBytes(32).toString('base64url');
}

export function hashManageToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}
