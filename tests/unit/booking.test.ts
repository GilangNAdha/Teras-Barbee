import { describe, expect, it } from 'vitest';
import { bookingInputSchema, serviceInputSchema } from '@/lib/validation/booking';
import { idr } from '@/lib/format';

const validBooking = {
  serviceId: '13d0e7e1-c045-4f08-b9ca-a3261e8cc8f2',
  barberId: '85e13e36-8b33-4484-98b6-dbac21a40931',
  startsAt: '2027-01-05T04:00:00.000Z',
  customerName: 'Raka', customerPhone: '+62 812 3456 7890', notes: ''
};

describe('public booking input', () => {
  it('accepts a valid appointment request', () => {
    expect(bookingInputSchema.safeParse(validBooking).success).toBe(true);
  });
  it('rejects malformed ids, timestamps, and phone numbers', () => {
    expect(bookingInputSchema.safeParse({ ...validBooking, serviceId: 'not-an-id' }).success).toBe(false);
    expect(bookingInputSchema.safeParse({ ...validBooking, startsAt: 'tomorrow' }).success).toBe(false);
    expect(bookingInputSchema.safeParse({ ...validBooking, customerPhone: 'call me' }).success).toBe(false);
  });
  it('rejects extra client-controlled fields', () => {
    expect(bookingInputSchema.safeParse({ ...validBooking, status: 'confirmed', price: 0 }).success).toBe(false);
  });
  it('normalizes optional notes to an empty string', () => {
    expect(bookingInputSchema.parse({ ...validBooking, notes: undefined }).notes).toBe('');
  });
});

describe('service data', () => {
  it('rejects an invalid duration and unsafe slug', () => {
    const result = serviceInputSchema.safeParse({ name: 'Cut', slug: '../cut', duration_minutes: 4, price_idr: 25000 });
    expect(result.success).toBe(false);
  });
  it('defaults to haircut and rejects unknown categories', () => {
    const valid = { name: 'Cut', slug: 'cut', duration_minutes: 45, price_idr: 25000 };
    expect(serviceInputSchema.parse(valid).category).toBe('HAIRCUT');
    expect(serviceInputSchema.safeParse({ ...valid, category: 'NAILS' }).success).toBe(false);
  });
  it('only accepts HTTPS service imagery', () => {
    const valid = { name: 'Cut', slug: 'cut', duration_minutes: 45, price_idr: 25000 };
    expect(serviceInputSchema.safeParse({ ...valid, image_url: 'http://example.com/cut.jpg' }).success).toBe(false);
    expect(serviceInputSchema.safeParse({ ...valid, image_url: 'https://example.com/cut.jpg' }).success).toBe(true);
  });
  it('formats rupiah without fractional digits', () => {
    expect(idr(45000)).toContain('45.000');
  });
});
