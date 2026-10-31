import { z } from 'zod';

// Supabase Auth requires an email address or phone number. These reserved,
// non-deliverable addresses are internal identifiers for username accounts.
export const ADMIN_LOGIN_ALIAS_DOMAIN = 'admin.terasbarber.invalid';
const usernamePattern = /^[a-z0-9][a-z0-9_-]{2,39}$/;
const emailSchema = z.email().max(254);

export function adminLoginEmail(identifier: string): string | null {
  const normalized = identifier.trim().toLowerCase();
  if (usernamePattern.test(normalized)) return `${normalized}@${ADMIN_LOGIN_ALIAS_DOMAIN}`;
  // Preserve sign-in for administrator accounts that already use a real email.
  if (emailSchema.safeParse(normalized).success) return normalized;
  return null;
}

export const adminLoginInputSchema = z.object({
  username: z.string().trim().min(1).max(254).refine(value => adminLoginEmail(value) !== null),
  password: z.string().min(8).max(128)
});
