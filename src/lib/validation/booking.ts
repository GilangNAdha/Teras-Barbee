import { z } from 'zod';

export function isValidWhatsapp(value: string) {
  const phone = value.trim();
  const digits = phone.replace(/\D/g, '');
  return /^\+?[0-9][0-9\s()-]{7,22}$/.test(phone) && digits.length >= 8 && digits.length <= 15;
}

// Accept the original single-service API shape as well as the new multi-service
// shape. Price and duration are expectations only; the database calculates both.
export const bookingInputSchema = z.object({
  serviceId: z.uuid().optional(),
  serviceIds: z.array(z.uuid()).min(1).max(5).refine(ids => new Set(ids).size === ids.length, 'Choose each service only once.').optional(),
  barberId: z.uuid().nullable().optional(),
  startsAt: z.iso.datetime({ offset: true }),
  customerName: z.string().trim().min(2).max(80),
  customerPhone: z.string().trim().refine(isValidWhatsapp, 'Enter a valid phone or WhatsApp number.'),
  notes: z.string().trim().max(500).optional().default(''),
  requestId: z.uuid().optional(),
  expectedPrice: z.number().int().min(0).max(500_000_000).optional(),
  expectedDuration: z.number().int().min(10).max(600).optional()
}).strict().superRefine((value, context) => {
  if (Boolean(value.serviceId) === Boolean(value.serviceIds)) {
    context.addIssue({ code: 'custom', message: 'Choose one or more services.', path: ['serviceIds'] });
  }
}).transform(value => ({ ...value, serviceIds: value.serviceIds ?? [value.serviceId!] }));

export const serviceInputSchema = z.object({
  name: z.string().trim().min(2).max(80),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  description: z.string().trim().max(500).default(''),
  category: z.enum(['HAIRCUT', 'COMBO', 'BEARD']).default('HAIRCUT'),
  duration_minutes: z.number().int().min(10).max(300),
  price_idr: z.number().int().min(0).max(100_000_000),
  image_url: z.url({ protocol: /^https$/ }).max(2048).nullable().optional(),
  is_active: z.boolean().default(true),
  sort_order: z.number().int().min(0).max(999).default(0)
}).strict();

export const appointmentStatusSchema = z.object({
  status: z.enum(['confirmed', 'cancelled', 'completed', 'no_show'])
}).strict();
