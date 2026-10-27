import { z } from 'zod';

export const bookingInputSchema = z.object({
  serviceId: z.uuid(),
  barberId: z.uuid().nullable().optional(),
  startsAt: z.iso.datetime({ offset: true }),
  customerName: z.string().trim().min(2).max(80),
  customerPhone: z.string().trim().regex(/^\+?[0-9][0-9\s()-]{7,19}$/, 'Enter a valid phone or WhatsApp number.'),
  notes: z.string().trim().max(500).optional().default('')
}).strict();

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
