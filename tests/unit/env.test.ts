import { afterEach, describe, expect, it } from 'vitest';
import {
  getBookingConfigError,
  getCronSecret,
  getEnabledNotificationChannels,
  getPublishableKey,
  getSecretKey,
  getTelegramConfig,
  getWhatsAppConfig,
  hasServiceConfig,
  hasSupabaseConfig,
  validateProductionEnv
} from '@/lib/env';

const TRACKED_KEYS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SECRET_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'BOOKING_HASH_SECRET',
  'CRON_SECRET',
  'BOOKING_NOTIFICATION_CHANNELS',
  'TELEGRAM_BOT_TOKEN',
  'WHATSAPP_API_TOKEN',
  'WHATSAPP_PHONE_NUMBER_ID',
  'WHATSAPP_API_VERSION'
];

const saved = new Map<string, string | undefined>();

afterEach(() => {
  for (const key of TRACKED_KEYS) {
    const previous = saved.get(key);
    if (previous === undefined) delete process.env[key];
    else process.env[key] = previous;
  }
  saved.clear();
});

function setEnv(values: Record<string, string>) {
  for (const [key, value] of Object.entries(values)) {
    saved.set(key, process.env[key]);
    process.env[key] = value;
  }
}

describe('environment resolution', () => {
  it('prefers the new publishable key and falls back to the legacy anon key', () => {
    setEnv({ NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'legacy-anon' });
    expect(getPublishableKey()).toBe('sb_publishable_test');
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    expect(getPublishableKey()).toBe('legacy-anon');
  });

  it('prefers the new secret key and falls back to the legacy service-role key', () => {
    setEnv({ SUPABASE_SECRET_KEY: 'sb_secret_test', SUPABASE_SERVICE_ROLE_KEY: 'legacy-service' });
    expect(getSecretKey()).toBe('sb_secret_test');
    delete process.env.SUPABASE_SECRET_KEY;
    expect(getSecretKey()).toBe('legacy-service');
  });

  it('reports missing Supabase configuration without throwing at import time', () => {
    expect(hasSupabaseConfig()).toBe(false);
    expect(hasServiceConfig()).toBe(false);
    expect(getBookingConfigError()).toMatch(/not configured/i);
  });

  it('requires a sufficiently long booking hash secret', () => {
    setEnv({
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
      SUPABASE_SECRET_KEY: 'sb_secret_test',
      BOOKING_HASH_SECRET: 'too-short'
    });
    expect(hasServiceConfig()).toBe(true);
    expect(getBookingConfigError()).toMatch(/not fully configured/i);
    setEnv({ BOOKING_HASH_SECRET: 'a'.repeat(32) });
    expect(getBookingConfigError()).toBeNull();
  });

  it('validates the production environment and lists every missing variable', () => {
    const result = validateProductionEnv();
    expect(result.ok).toBe(false);
    expect(result.missing).toContain('NEXT_PUBLIC_SUPABASE_URL');
    expect(result.missing).toContain('CRON_SECRET');
  });

  it('only resolves supported notification channels', () => {
    setEnv({ BOOKING_NOTIFICATION_CHANNELS: ' telegram , email, whatsapp ' });
    expect(getEnabledNotificationChannels()).toEqual(['telegram', 'whatsapp']);
    setEnv({ BOOKING_NOTIFICATION_CHANNELS: 'email' });
    expect(getEnabledNotificationChannels()).toEqual(['telegram']);
  });

  it('returns null provider configs when credentials are absent', () => {
    expect(getTelegramConfig()).toBeNull();
    expect(getWhatsAppConfig()).toBeNull();
    expect(getCronSecret()).toBeNull();
  });

  it('parses WhatsApp and Telegram configuration when present', () => {
    setEnv({
      TELEGRAM_BOT_TOKEN: 'bot-token',
      WHATSAPP_API_TOKEN: 'wa-token',
      WHATSAPP_PHONE_NUMBER_ID: '123456',
      WHATSAPP_API_VERSION: 'v20.0'
    });
    expect(getTelegramConfig()).toEqual({ botToken: 'bot-token' });
    expect(getWhatsAppConfig()).toEqual({ apiToken: 'wa-token', phoneNumberId: '123456', apiVersion: 'v20.0' });
  });
});
