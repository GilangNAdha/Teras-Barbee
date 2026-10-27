import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildNotificationMessage } from '@/lib/notifications/messages';
import { sendTelegram, sendWhatsApp, type FetchLike } from '@/lib/notifications/providers';
import {
  nextBackoffMs,
  processNotificationJobs,
  type NotificationGateway
} from '@/lib/notifications/worker';
import type {
  NotificationJob,
  NotificationLogInput,
  NotificationPayload
} from '@/lib/notifications/types';

const ENV_KEYS = [
  'TELEGRAM_BOT_TOKEN',
  'WHATSAPP_API_TOKEN',
  'WHATSAPP_PHONE_NUMBER_ID',
  'WHATSAPP_API_VERSION',
  'BOOKING_NOTIFICATION_CHANNELS'
];
const savedEnv = new Map<string, string | undefined>();

beforeEach(() => {
  for (const key of ENV_KEYS) savedEnv.set(key, process.env[key]);
  process.env.TELEGRAM_BOT_TOKEN = 'test-bot-token';
  process.env.WHATSAPP_API_TOKEN = 'test-wa-token';
  process.env.WHATSAPP_PHONE_NUMBER_ID = '111222';
  process.env.WHATSAPP_API_VERSION = 'v21.0';
  process.env.BOOKING_NOTIFICATION_CHANNELS = 'telegram,whatsapp';
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const key of ENV_KEYS) {
    const value = savedEnv.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

const payload: NotificationPayload = {
  event: 'booking_created',
  booking_code: 'ABC1234567',
  customer_name: 'Raka Pratama',
  service_name: 'Classic Haircut',
  price_idr: 75000,
  duration_minutes: 45,
  starts_at: '2027-01-05T05:00:00.000Z',
  ends_at: '2027-01-05T05:45:00.000Z',
  status: 'pending',
  timezone: 'Asia/Jakarta'
};

function makeJob(overrides: Partial<NotificationJob> = {}): NotificationJob {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    appointment_id: '00000000-0000-4000-8000-000000000010',
    event_type: 'booking_created',
    channel: 'telegram',
    recipient: '987654321',
    idempotency_key: 'booking_created:test:telegram:barber',
    payload: payload as unknown as NotificationJob['payload'],
    status: 'processing',
    attempt_count: 1,
    max_attempts: 5,
    scheduled_at: '2027-01-01T00:00:00.000Z',
    locked_at: '2027-01-01T00:00:00.000Z',
    locked_until: '2027-01-01T00:05:00.000Z',
    last_error: null,
    created_at: '2027-01-01T00:00:00.000Z',
    updated_at: '2027-01-01T00:00:00.000Z',
    ...overrides
  };
}

class FakeGateway implements NotificationGateway {
  logs: NotificationLogInput[] = [];
  updates: Array<{ id: string; patch: Partial<NotificationJob> }> = [];
  constructor(
    private readonly jobs: NotificationJob[],
    private readonly appointment: { id: string; status: string } | null = {
      id: '00000000-0000-4000-8000-000000000010',
      status: 'pending'
    }
  ) {}
  claimJobs = vi.fn(async () => this.jobs);
  getAppointment = vi.fn(async () => this.appointment);
  recordLog = vi.fn(async (input: NotificationLogInput) => {
    this.logs.push(input);
  });
  updateJob = vi.fn(async (id: string, patch: Partial<NotificationJob>) => {
    this.updates.push({ id, patch });
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('notification message rendering', () => {
  it('includes the booking code, service and localized time', () => {
    const message = buildNotificationMessage(payload);
    expect(message).toContain('ABC1234567');
    expect(message).toContain('Classic Haircut');
    expect(message).toContain('Asia/Jakarta');
  });

  it('renders every supported event without throwing', () => {
    for (const event of [
      'booking_confirmed',
      'booking_cancelled',
      'booking_rescheduled',
      'barber_assignment_changed',
      'appointment_reminder'
    ] as const) {
      expect(buildNotificationMessage({ ...payload, event })).toContain('ABC1234567');
    }
  });
});

describe('telegram provider', () => {
  it('posts to the Telegram Bot API and extracts the provider message id', async () => {
    const fetchMock = vi.fn<FetchLike>(async () => jsonResponse({ ok: true, result: { message_id: 42 } }));
    const result = await sendTelegram({ botToken: 'bot-token' }, '987654321', 'hello', fetchMock);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.providerMessageId).toBe('42');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.telegram.org/botbot-token/sendMessage');
    const body = JSON.parse(String(init?.body));
    expect(body.chat_id).toBe('987654321');
    expect(body.text).toBe('hello');
  });

  it('marks 401 responses as permanent failures', async () => {
    const fetchMock = vi.fn<FetchLike>(async () => jsonResponse({ description: 'Unauthorized' }, 401));
    const result = await sendTelegram({ botToken: 'bad' }, '987654321', 'hello', fetchMock);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.permanent).toBe(true);
  });
});

describe('whatsapp cloud provider', () => {
  it('posts a normalized recipient to the Graph API with a bearer token', async () => {
    const fetchMock = vi.fn<FetchLike>(async () => jsonResponse({ messages: [{ id: 'wamid.abc' }] }));
    const result = await sendWhatsApp(
      { apiToken: 'wa-token', phoneNumberId: '111222', apiVersion: 'v21.0' },
      '+62 812-3456-7890',
      'hello',
      fetchMock
    );
    expect(result.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://graph.facebook.com/v21.0/111222/messages');
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer wa-token' });
    const body = JSON.parse(String(init?.body));
    expect(body.to).toBe('6281234567890');
    expect(body.messaging_product).toBe('whatsapp');
  });

  it('treats network errors as transient', async () => {
    const fetchMock = vi.fn<FetchLike>(async () => {
      throw new TypeError('fetch failed');
    });
    const result = await sendWhatsApp(
      { apiToken: 'wa-token', phoneNumberId: '111222', apiVersion: 'v21.0' },
      '+6281234567890',
      'hello',
      fetchMock
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.permanent).toBe(false);
      expect(result.responseCode).toBe('NETWORK_ERROR');
    }
  });

  it('rejects recipients that are not phone numbers as permanent', async () => {
    const result = await sendWhatsApp(
      { apiToken: 'wa-token', phoneNumberId: '111222', apiVersion: 'v21.0' },
      'abc',
      'hello'
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.permanent).toBe(true);
  });
});

describe('notification worker', () => {
  it('sends a telegram job, records the attempt and marks the job sent', async () => {
    const fetchMock = vi.fn<FetchLike>(async () => jsonResponse({ ok: true, result: { message_id: 7 } }));
    const gateway = new FakeGateway([makeJob()]);
    const summary = await processNotificationJobs({ gateway, fetchImpl: fetchMock });

    expect(summary).toMatchObject({ claimed: 1, sent: 1, retried: 0, dead: 0, skipped: 0 });
    expect(gateway.logs).toHaveLength(1);
    expect(gateway.logs[0]).toMatchObject({ status: 'sent', provider_message_id: '7' });
    expect(gateway.updates[0].patch).toMatchObject({ status: 'sent', locked_at: null });
  });

  it('retries transient failures with exponential backoff', async () => {
    const fetchMock = vi.fn<FetchLike>(async () => jsonResponse({ error: 'busy' }, 500));
    const gateway = new FakeGateway([makeJob({ attempt_count: 2 })]);
    const before = Date.now();
    const summary = await processNotificationJobs({ gateway, fetchImpl: fetchMock, random: () => 0 });

    expect(summary.retried).toBe(1);
    const patch = gateway.updates[0].patch;
    expect(patch.status).toBe('pending');
    expect(patch.locked_at).toBeNull();
    expect(Date.parse(patch.scheduled_at as string)).toBeGreaterThan(before);
    expect(gateway.logs[0]).toMatchObject({ status: 'failed', response_code: '500' });
  });

  it('moves permanent failures straight to dead without burning retries', async () => {
    const fetchMock = vi.fn<FetchLike>(async () => jsonResponse({ description: 'bad token' }, 401));
    const gateway = new FakeGateway([makeJob({ attempt_count: 1 })]);
    const summary = await processNotificationJobs({ gateway, fetchImpl: fetchMock });
    expect(summary.dead).toBe(1);
    expect(gateway.updates[0].patch.status).toBe('dead');
  });

  it('marks jobs dead when max attempts are exhausted', async () => {
    const fetchMock = vi.fn<FetchLike>(async () => jsonResponse({ error: 'busy' }, 500));
    const gateway = new FakeGateway([makeJob({ attempt_count: 5, max_attempts: 5 })]);
    const summary = await processNotificationJobs({ gateway, fetchImpl: fetchMock });
    expect(summary.dead).toBe(1);
    expect(gateway.updates[0].patch.status).toBe('dead');
  });

  it('skips reminders for cancelled or completed appointments', async () => {
    const fetchMock = vi.fn<FetchLike>();
    const gateway = new FakeGateway(
      [makeJob({ event_type: 'appointment_reminder', channel: 'whatsapp', recipient: '+6281234567890' })],
      { id: '00000000-0000-4000-8000-000000000010', status: 'cancelled' }
    );
    const summary = await processNotificationJobs({ gateway, fetchImpl: fetchMock });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(summary.skipped).toBe(1);
    expect(gateway.logs[0].status).toBe('skipped');
    expect(gateway.updates[0].patch.status).toBe('dead');
  });

  it('dead-letters jobs for channels disabled in the environment', async () => {
    process.env.BOOKING_NOTIFICATION_CHANNELS = 'whatsapp';
    const fetchMock = vi.fn<FetchLike>();
    const gateway = new FakeGateway([makeJob({ channel: 'telegram' })]);
    const summary = await processNotificationJobs({ gateway, fetchImpl: fetchMock });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(summary.skipped).toBe(1);
    expect(gateway.logs[0].error_message).toContain('channel_disabled');
  });

  it('dead-letters whatsapp jobs with a clear reason when the provider is unconfigured', async () => {
    delete process.env.WHATSAPP_API_TOKEN;
    const fetchMock = vi.fn<FetchLike>();
    const gateway = new FakeGateway([makeJob({ channel: 'whatsapp', recipient: '+6281234567890' })]);
    const summary = await processNotificationJobs({ gateway, fetchImpl: fetchMock });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(summary.skipped).toBe(1);
    expect(gateway.logs[0].error_message).toBe('whatsapp_not_configured');
  });

  it('dead-letters jobs whose appointment no longer exists', async () => {
    const gateway = new FakeGateway([makeJob()], null);
    const summary = await processNotificationJobs({ gateway, fetchImpl: vi.fn() });
    expect(summary.skipped).toBe(1);
    expect(gateway.logs[0].error_message).toBe('appointment_missing');
  });

  it('returns an empty summary when no jobs are due', async () => {
    const gateway = new FakeGateway([]);
    const summary = await processNotificationJobs({ gateway });
    expect(summary.claimed).toBe(0);
    expect(gateway.getAppointment).not.toHaveBeenCalled();
  });
});

describe('backoff scheduling', () => {
  it('doubles each attempt and caps at four hours', () => {
    expect(nextBackoffMs(1, () => 0)).toBe(60_000);
    expect(nextBackoffMs(2, () => 0)).toBe(120_000);
    expect(nextBackoffMs(3, () => 0)).toBe(240_000);
    expect(nextBackoffMs(10, () => 0)).toBe(4 * 60 * 60 * 1000);
  });

  it('adds bounded jitter', () => {
    expect(nextBackoffMs(1, () => 0.5)).toBe(60_000 + 15_000);
  });
});
