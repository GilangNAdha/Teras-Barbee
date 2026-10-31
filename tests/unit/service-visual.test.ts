import { describe, expect, it } from 'vitest';
import { serviceImage, serviceImageIsIllustrative } from '@/lib/service-visual';

describe('service imagery', () => {
  it.each([
    ['HAIRCUT', '/images/service-haircut.jpg'],
    ['COMBO', '/images/service-combo.jpg'],
    ['BEARD', '/images/service-beard.jpg']
  ] as const)('provides a category image for %s services', (category, expected) => {
    const service = { category, image_url: null };
    expect(serviceImage(service)).toBe(expected);
    expect(serviceImageIsIllustrative(service)).toBe(true);
  });

  it('alternates illustrations for services in the same category', () => {
    const service = { category: 'HAIRCUT' as const, image_url: null };
    expect(serviceImage(service, 0)).not.toBe(serviceImage(service, 1));
    expect(serviceImage(service, 2)).toBe(serviceImage(service, 0));
  });

  it('prefers a verified custom service image', () => {
    const service = { category: 'HAIRCUT' as const, image_url: 'https://images.example.test/cut.jpg' };
    expect(serviceImage(service)).toBe(service.image_url);
    expect(serviceImageIsIllustrative(service)).toBe(false);
  });
});
