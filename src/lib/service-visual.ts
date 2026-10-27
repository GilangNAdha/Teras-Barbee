export type ServiceCategory = 'HAIRCUT' | 'COMBO' | 'BEARD';
type ServicePhoto = { category: ServiceCategory; image_url: string | null };

const categoryImages: Record<ServiceCategory, string> = {
  HAIRCUT: '/images/service-haircut.jpg',
  COMBO: '/images/service-combo.jpg',
  BEARD: '/images/service-beard.jpg'
};

export function serviceImage(service: ServicePhoto) {
  return service.image_url || categoryImages[service.category];
}

export function serviceImageIsIllustrative(service: Pick<ServicePhoto, 'image_url'>) {
  return !service.image_url;
}
