import { describe, expect, it } from 'vitest';
import { bookingSlotKey, groupBookingSlots } from '@/lib/booking-slots';

describe('booking slot identities', () => {
  it('distinguishes the same start time offered by two different barbers', () => {
    const start = '2027-01-05T04:00:00.000Z';
    expect(bookingSlotKey({ starts_at: start, barber_id: 'barber-a' })).not.toBe(bookingSlotKey({ starts_at: start, barber_id: 'barber-b' }));
  });
  it('groups no-preference times and only disables a time when every barber is unavailable', () => {
    const start = '2027-01-05T04:00:00.000Z';
    const grouped = groupBookingSlots([
      { starts_at: start, barber_id: 'a', barber_name: 'A', is_available: false },
      { starts_at: start, barber_id: 'b', barber_name: 'B', is_available: true },
      { starts_at: '2027-01-05T04:30:00.000Z', barber_id: 'a', barber_name: 'A', is_available: false }
    ]);
    expect(grouped).toHaveLength(2);
    expect(grouped[0]).toMatchObject({ is_available: true, availableBarbers: 1, slot: { barber_id: 'b' } });
    expect(grouped[1].is_available).toBe(false);
  });
});
