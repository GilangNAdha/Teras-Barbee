export type ServiceCategory = 'HAIRCUT' | 'COMBO' | 'BEARD';
type ServicePhoto = { category: ServiceCategory; image_url: string | null };

// These are editorial illustrations, not photographs of the shop's actual work.
// Admin-supplied images always take precedence. Alternating the fallbacks keeps
// a menu with several services in the same category from becoming repetitive.
const categoryImages: Record<ServiceCategory, readonly string[]> = {
  HAIRCUT: ['/images/service-haircut.jpg', '/images/service-haircut-detail.jpg'],
  COMBO: ['/images/service-combo.jpg', '/images/service-combo-detail.jpg'],
  BEARD: ['/images/service-beard.jpg', '/images/service-beard-detail.jpg']
};

export function serviceImage(service: ServicePhoto, categoryIndex = 0) {
  const images = categoryImages[service.category];
  return service.image_url || images[Math.abs(categoryIndex) % images.length];
}

export function serviceImageIsIllustrative(service: Pick<ServicePhoto, 'image_url'>) {
  return !service.image_url;
}
