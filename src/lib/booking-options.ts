import type { ServiceCategory } from '@/lib/service-visual';

export type BookingService = {
  id: string;
  name: string;
  description: string;
  category: ServiceCategory;
  image_url: string | null;
  price_idr: number;
  duration_minutes: number;
};

export type BookingBarber = {
  id: string;
  name: string;
  bio: string;
  specialties: string[];
  portrait_url: string | null;
  serviceIds: string[];
};
