import { describe, expect, it } from 'vitest';
import { bookingSlotKey } from '@/lib/booking-slots';

describe('booking slot identities', () => {
  it('distinguishes the same start time offered by two different barbers', () => {
    const start = '2027-01-05T04:00:00.000Z';
    expect(bookingSlotKey({ starts_at: start, barber_id: 'barber-a' })).not.toBe(bookingSlotKey({ starts_at: start, barber_id: 'barber-b' }));
  });
});
