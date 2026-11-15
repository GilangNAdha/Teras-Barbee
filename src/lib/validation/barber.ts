import { z } from 'zod';

export const barberInputSchema = z.object({
  name: z.string().trim().min(2).max(80),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  portrait_url: z.url({ protocol: /^https$/ }).max(2048).nullable(),
  preview_cut_url: z.url({ protocol: /^https$/ }).max(2048).nullable(),
  years_experience: z.number().int().min(0).max(60).nullable(),
  phone_whatsapp: z.string().trim().regex(/^\+?[0-9][0-9\s()-]{7,19}$/).nullable(),
  is_active: z.boolean(),
  sort_order: z.number().int().min(0).max(999)
}).strict();
