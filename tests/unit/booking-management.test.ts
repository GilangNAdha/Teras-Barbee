import { describe, expect, it } from 'vitest';
import { createManageToken, hashManageToken, manageBookingRequestSchema, manageTokenSchema } from '@/lib/booking-management';

describe('secure booking management credentials', () => {
  it('creates unguessable URL-safe tokens and stores only a one-way hash', () => {
    const token = createManageToken();
    expect(manageTokenSchema.safeParse(token).success).toBe(true);
    expect(hashManageToken(token)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashManageToken(token)).not.toBe(token);
    expect(hashManageToken(token)).toBe(hashManageToken(token));
    expect(createManageToken()).not.toBe(token);
  });

  it('validates cancellation and reschedule payloads strictly', () => {
    expect(manageBookingRequestSchema.safeParse({ action: 'cancel', reason: 'Plans changed' }).success).toBe(true);
    expect(manageBookingRequestSchema.safeParse({ action: 'reschedule', startsAt: '2027-06-05T10:00:00+07:00' }).success).toBe(true);
    expect(manageBookingRequestSchema.safeParse({ action: 'reschedule', startsAt: 'not-a-date' }).success).toBe(false);
    expect(manageBookingRequestSchema.safeParse({ action: 'cancel', isAdmin: true }).success).toBe(false);
  });
});
