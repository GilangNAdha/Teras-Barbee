import 'server-only';

// Central, server-only environment access. The app is designed to boot without
// Supabase configured (it renders setup notices), so missing values never throw
// at import time. Privileged operations call the explicit "require" helpers,
// which return actionable error messages instead of leaking raw exceptions.

export const DEFAULT_TIMEZONE = 'Asia/Jakarta';

function read(...names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return null;
}

export function getSupabaseUrl() {
  return read('NEXT_PUBLIC_SUPABASE_URL');
}

// Current Supabase projects issue publishable keys (sb_publishable_...).
// Legacy JWT anon keys remain supported so existing deployments keep working.
export function getPublishableKey() {
  return read('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY');
}

// New projects issue secret keys (sb_secret_...); legacy service-role JWTs work too.
export function getSecretKey() {
  return read('SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY');
}

export function getBookingHashSecret() {
  return read('BOOKING_HASH_SECRET');
}

export function getCronSecret() {
  return read('CRON_SECRET');
}

export function getBookingTimezone() {
  return read('BOOKING_TIMEZONE') ?? DEFAULT_TIMEZONE;
}

export function getSiteUrl() {
  return read('NEXT_PUBLIC_SITE_URL') ?? 'http://localhost:3000';
}

export type NotificationChannel = 'telegram' | 'whatsapp';

export function getEnabledNotificationChannels(): NotificationChannel[] {
  const raw = read('BOOKING_NOTIFICATION_CHANNELS') ?? 'telegram';
  const channels = raw
    .split(',')
    .map(value => value.trim().toLowerCase())
    .filter((value): value is NotificationChannel => value === 'telegram' || value === 'whatsapp');
  return channels.length > 0 ? Array.from(new Set(channels)) : ['telegram'];
}

export function getTelegramConfig() {
  const botToken = read('TELEGRAM_BOT_TOKEN');
  return botToken ? { botToken } : null;
}

export function getWhatsAppConfig() {
  const apiToken = read('WHATSAPP_API_TOKEN');
  const phoneNumberId = read('WHATSAPP_PHONE_NUMBER_ID');
  const apiVersion = read('WHATSAPP_API_VERSION') ?? 'v21.0';
  return apiToken && phoneNumberId ? { apiToken, phoneNumberId, apiVersion } : null;
}

export function hasSupabaseConfig() {
  return Boolean(getSupabaseUrl() && getPublishableKey());
}

export function hasServiceConfig() {
  return Boolean(hasSupabaseConfig() && getSecretKey());
}

// Booking additionally needs the HMAC secret used for rate-limit hashing.
export function getBookingConfigError() {
  if (!hasServiceConfig()) return 'Online booking is not configured yet.';
  const secret = getBookingHashSecret();
  if (!secret || secret.length < 32) {
    return 'Bookings are not fully configured. Please contact the shop.';
  }
  return null;
}

// Clear, testable validation result for deployment diagnostics.
export function validateProductionEnv() {
  const missing: string[] = [];
  if (!getSupabaseUrl()) missing.push('NEXT_PUBLIC_SUPABASE_URL');
  if (!getPublishableKey()) missing.push('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
  if (!getSecretKey()) missing.push('SUPABASE_SECRET_KEY');
  if (!getBookingHashSecret()) missing.push('BOOKING_HASH_SECRET');
  if (!getCronSecret()) missing.push('CRON_SECRET');
  return { ok: missing.length === 0, missing };
}
