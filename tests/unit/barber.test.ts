import { describe, expect, it } from 'vitest';
import { barberInputSchema } from '@/lib/validation/barber';

const validBarber = {
  name: 'Raka', slug: 'raka', portrait_url: null,
  preview_cut_url: null, years_experience: 8, phone_whatsapp: null, is_active: true, sort_order: 0
};

describe('barber profile data', () => {
  it('accepts experience and optional public media/contact', () => {
    expect(barberInputSchema.safeParse(validBarber).success).toBe(true);
    expect(
      barberInputSchema.safeParse({
        ...validBarber,
        portrait_url: 'https://example.supabase.co/storage/v1/object/public/shop-media/barbers/portraits/test.jpg',
        preview_cut_url: 'https://example.supabase.co/storage/v1/object/public/shop-media/barbers/cuts/test.jpg'
      }).success
    ).toBe(true);
  });

  it('rejects out-of-range experience and non-HTTPS profile media', () => {
    expect(barberInputSchema.safeParse({ ...validBarber, years_experience: 61 }).success).toBe(false);
    expect(barberInputSchema.safeParse({ ...validBarber, preview_cut_url: 'http://example.test/cut.jpg' }).success).toBe(false);
  });

  it('rejects malformed WhatsApp numbers', () => {
    expect(barberInputSchema.safeParse({ ...validBarber, phone_whatsapp: 'not a phone' }).success).toBe(false);
  });
});
