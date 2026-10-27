import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  getEnabledNotificationChannels,
  getTelegramConfig,
  getWhatsAppConfig
} from '@/lib/env';
import { buildNotificationMessage } from '@/lib/notifications/messages';
import { sendTelegram, sendWhatsApp, type FetchLike } from '@/lib/notifications/providers';
import type {
  DeliveryResult,
  NotificationJob,
  NotificationLogInput,
  NotificationPayload,
  ProcessSummary
} from '@/lib/notifications/types';
import type { Database } from '@/lib/database.types';

// Narrow interface so the worker logic can be unit tested without a database.
export interface NotificationGateway {
  claimJobs(batchSize: number, leaseMinutes: number): Promise<NotificationJob[]>;
  getAppointment(id: string): Promise<{ id: string; status: string } | null>;
  recordLog(input: NotificationLogInput): Promise<void>;
  updateJob(id: string, patch: Partial<NotificationJob>): Promise<void>;
}

export function createSupabaseNotificationGateway(
  supabase: SupabaseClient<Database>
): NotificationGateway {
  return {
    async claimJobs(batchSize, leaseMinutes) {
      const { data, error } = await supabase.rpc('claim_notification_jobs', {
        p_batch_size: batchSize,
        p_lease: `${leaseMinutes} minutes`
      });
      if (error) throw new Error(`claim_notification_jobs failed: ${error.message}`);
      return (data ?? []) as unknown as NotificationJob[];
    },
    async getAppointment(id) {
      const { data, error } = await supabase
        .from('appointments')
        .select('id,status')
        .eq('id', id)
        .maybeSingle();
      if (error) throw new Error(`appointment lookup failed: ${error.message}`);
      return data;
    },
    async recordLog(input) {
      const { error } = await supabase.from('notification_logs').insert(input);
      if (error) throw new Error(`notification_logs insert failed: ${error.message}`);
    },
    async updateJob(id, patch) {
      const { error } = await supabase.from('notification_jobs').update(patch).eq('id', id);
      if (error) throw new Error(`notification_jobs update failed: ${error.message}`);
    }
  };
}

const BATCH_SIZE = 10;
const LEASE_MINUTES = 5;
const MAX_BACKOFF_MS = 4 * 60 * 60 * 1000;

export function nextBackoffMs(attemptCount: number, random: () => number = Math.random) {
  const exponential = 2 ** Math.max(0, attemptCount - 1) * 60_000;
  const jitter = Math.floor(random() * 30_000);
  return Math.min(exponential, MAX_BACKOFF_MS) + jitter;
}

function parsePayload(job: NotificationJob): NotificationPayload | null {
  const payload = job.payload;
  if (typeof payload === 'object' && payload !== null && 'booking_code' in payload) {
    return payload as NotificationPayload;
  }
  return null;
}

export type WorkerDeps = {
  gateway: NotificationGateway;
  fetchImpl?: FetchLike;
  now?: () => Date;
  random?: () => number;
  channels?: ReturnType<typeof getEnabledNotificationChannels>;
};

export async function processNotificationJobs(deps: WorkerDeps): Promise<ProcessSummary> {
  const summary: ProcessSummary = {
    claimed: 0,
    sent: 0,
    retried: 0,
    dead: 0,
    skipped: 0,
    jobIds: []
  };

  const jobs = await deps.gateway.claimJobs(BATCH_SIZE, LEASE_MINUTES);
  summary.claimed = jobs.length;
  if (jobs.length === 0) return summary;

  const enabledChannels = new Set(deps.channels ?? getEnabledNotificationChannels());
  const telegramConfig = getTelegramConfig();
  const whatsAppConfig = getWhatsAppConfig();
  const now = deps.now ?? (() => new Date());
  const random = deps.random ?? Math.random;

  for (const job of jobs) {
    summary.jobIds.push(job.id);

    const skip = async (reason: string) => {
      await deps.gateway.recordLog({
        notification_job_id: job.id,
        status: 'skipped',
        error_message: reason,
        sent_at: null
      });
      await deps.gateway.updateJob(job.id, {
        status: 'dead',
        locked_at: null,
        locked_until: null,
        last_error: reason
      });
      summary.skipped += 1;
      summary.dead += 1;
    };

    const appointment = await deps.gateway.getAppointment(job.appointment_id);
    if (!appointment) {
      await skip('appointment_missing');
      continue;
    }

    // Reminders must never go out for appointments that no longer need them.
    if (job.event_type === 'appointment_reminder' && appointment.status !== 'confirmed') {
      await skip(`reminder_skipped:appointment_${appointment.status}`);
      continue;
    }

    if (!enabledChannels.has(job.channel)) {
      await skip(`channel_disabled:${job.channel}`);
      continue;
    }

    const payload = parsePayload(job);
    if (!payload) {
      await skip('invalid_payload');
      continue;
    }

    let result: DeliveryResult;
    if (job.channel === 'telegram') {
      if (!telegramConfig) {
        await skip('telegram_not_configured');
        continue;
      }
      result = await sendTelegram(
        telegramConfig,
        job.recipient,
        buildNotificationMessage(payload),
        deps.fetchImpl
      );
    } else {
      if (!whatsAppConfig) {
        await skip('whatsapp_not_configured');
        continue;
      }
      result = await sendWhatsApp(
        whatsAppConfig,
        job.recipient,
        buildNotificationMessage(payload),
        deps.fetchImpl
      );
    }

    if (result.ok) {
      await deps.gateway.recordLog({
        notification_job_id: job.id,
        provider_message_id: result.providerMessageId,
        status: 'sent',
        response_code: result.responseCode,
        sent_at: now().toISOString()
      });
      await deps.gateway.updateJob(job.id, {
        status: 'sent',
        locked_at: null,
        locked_until: null,
        last_error: null
      });
      summary.sent += 1;
      continue;
    }

    await deps.gateway.recordLog({
      notification_job_id: job.id,
      status: 'failed',
      response_code: result.responseCode,
      error_message: result.error,
      sent_at: null
    });

    const exhausted = job.attempt_count >= job.max_attempts;
    if (result.permanent || exhausted) {
      await deps.gateway.updateJob(job.id, {
        status: 'dead',
        locked_at: null,
        locked_until: null,
        last_error: truncate(result.error)
      });
      summary.dead += 1;
    } else {
      await deps.gateway.updateJob(job.id, {
        status: 'pending',
        locked_at: null,
        locked_until: null,
        scheduled_at: new Date(now().getTime() + nextBackoffMs(job.attempt_count, random)).toISOString(),
        last_error: truncate(result.error)
      });
      summary.retried += 1;
    }
  }

  return summary;
}

function truncate(message: string) {
  return message.length > 500 ? message.slice(0, 500) : message;
}
