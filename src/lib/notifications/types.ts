import type { Database } from '@/lib/database.types';

export type NotificationJob = Database['public']['Tables']['notification_jobs']['Row'];
export type NotificationChannel = NotificationJob['channel'];
export type NotificationEventType = NotificationJob['event_type'];

export type NotificationPayload = {
  event: NotificationEventType;
  booking_code: string;
  customer_name: string;
  service_name: string;
  price_idr: number;
  duration_minutes: number;
  starts_at: string;
  ends_at: string;
  status: string;
  timezone: string;
  [key: string]: unknown;
};

export type DeliveryResult =
  | { ok: true; providerMessageId: string | null; responseCode: string }
  | { ok: false; responseCode: string; error: string; permanent: boolean };

export type NotificationLogInput = {
  notification_job_id: string;
  provider_message_id?: string | null;
  status: 'sent' | 'failed' | 'skipped';
  response_code?: string | null;
  error_message?: string | null;
  sent_at?: string | null;
};

export type ProcessSummary = {
  claimed: number;
  sent: number;
  retried: number;
  dead: number;
  skipped: number;
  jobIds: string[];
};
