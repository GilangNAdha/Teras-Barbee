# Notification outbox and delivery workers

Automatic Telegram and WhatsApp delivery is implemented with a transactional
outbox so that messaging availability never affects booking integrity.

## 1. Data model

- `notification_jobs` — one row per message to deliver. Unique
  `idempotency_key`, lifecycle `pending → processing → sent / failed / dead`,
  lease columns (`locked_at`, `locked_until`), retry bookkeeping
  (`attempt_count`, `max_attempts`, `scheduled_at`, `last_error`) and a JSON
  `payload` snapshot captured when the appointment changed.
- `notification_logs` — one row per delivery attempt with provider message id,
  HTTP response code, error text, attempt and send timestamps.
- `notification_settings` — private single-row table: admin Telegram chat id,
  enabled channels, reminder lead time. No secrets are stored in the database.
- `barber_contact_channels` — private per-barber WhatsApp number and Telegram
  chat id.

RLS is enabled on every table. Only `service_role` can mutate jobs and logs;
admins have read access for support; anonymous roles have no access at all.

## 2. Transactional enqueueing

The `appointments_enqueue_notifications` AFTER trigger runs inside the same
transaction as the appointment change:

| Event | Trigger condition | Recipients |
| --- | --- | --- |
| `booking_created` | INSERT | Barber Telegram (fallback admin), barber/shop WhatsApp |
| `booking_confirmed` | status → confirmed | Customer WhatsApp, barber Telegram |
| `booking_cancelled` | status → cancelled | Customer WhatsApp, barber Telegram |
| `booking_rescheduled` | `starts_at` changed while active | Customer WhatsApp, barber Telegram |
| `barber_assignment_changed` | `barber_id` changed | New barber Telegram, shop WhatsApp |
| `appointment_reminder` | maintenance cron | Customer WhatsApp, barber Telegram |

Enqueue failures only raise a Postgres warning — they never roll back the
booking. Idempotency keys (`event:appointment_id:channel:audience`) make
repeated trigger runs safe. System-expired pending bookings suppress
notifications via the `app.suppress_notifications` GUC.

## 3. Worker endpoints

Both routes are protected by `CRON_SECRET` (see
[DEPLOYMENT.md](./DEPLOYMENT.md)) and run as dynamic functions with bounded
durations.

### `GET /api/cron/process-notifications`

1. Authorizes the scheduled invocation.
2. Calls `claim_notification_jobs(batch, lease)`, which requeues stale leases
   and claims a batch with `FOR UPDATE SKIP LOCKED` so concurrent workers never
   touch the same job.
3. Validates the current appointment state. Reminders for cancelled,
   completed or no-show appointments are skipped and dead-lettered.
4. Skips jobs for channels disabled by `BOOKING_NOTIFICATION_CHANNELS` or
   providers that are not configured, recording a clear `skipped` log.
5. Sends through the provider with a 10-second timeout, never holding a
   database transaction open during the HTTP call.
6. Records the outcome in `notification_logs`, stores the provider message id,
   and either marks the job `sent` or reschedules it with bounded exponential
   backoff (1 min → 2 → 4 … capped at 4 h plus jitter).
7. HTTP 400/401/403/404/410/422 and invalid recipients are permanent
   (`dead` immediately); 429/5xx/timeouts/network errors retry until
   `max_attempts` (default 5) is exhausted, then the job is marked `dead` for
   administrator review.

Response bodies contain counts and job ids only — never recipients or message
content.

### `GET /api/cron/maintenance`

Runs two idempotent RPCs: `enqueue_appointment_reminders()` (lead time from
`notification_settings.reminder_hours`, default 24 h) and
`expire_stale_pending_bookings('30 minutes')`.

## 4. Provider configuration

### Telegram

1. Create a bot with [@BotFather](https://t.me/BotFather) and set
   `TELEGRAM_BOT_TOKEN`.
2. The barber or admin must message the bot once (Telegram bots cannot open
   conversations), then put the numeric chat id into
   `barber_contact_channels.telegram_chat_id` or
   `notification_settings.admin_telegram_chat_id`.

Delivery calls `POST https://api.telegram.org/bot<token>/sendMessage`.

### WhatsApp Business Cloud API

1. Create a Meta app with the WhatsApp product and a test/production phone
   number.
2. Set `WHATSAPP_API_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` and
   `WHATSAPP_API_VERSION` (default `v21.0`).
3. Recipient numbers are normalized to digits; test recipients must be
   verified on the Meta dashboard while the app is in development mode.

Delivery calls
`POST https://graph.facebook.com/<version>/<phoneNumberId>/messages`.

If WhatsApp is not configured, the application keeps working: Telegram
delivery continues, WhatsApp jobs are dead-lettered with
`whatsapp_not_configured`, and bookings are never affected. The customer-facing
`wa.me` link remains a manual fallback and is never treated as automatic
delivery.

## 5. Local and safe testing

- Unit tests mock the provider HTTP layer (`tests/unit/notifications.test.ts`).
- Never point development workers at production customer phone numbers or chat
  ids. Use Meta test recipients and a dedicated Telegram test chat.
- To exercise the worker locally, insert a pending `notification_jobs` row in
  the local Supabase stack and call:

  ```sh
  curl -H "Authorization: Bearer $CRON_SECRET" \
    http://localhost:3000/api/cron/process-notifications
  ```

- Outbox/claim/reminder/expiry database behaviour is covered by the pgTAP suite
  `supabase/tests/booking.sql` (`npm run test:db`, requires Docker).
