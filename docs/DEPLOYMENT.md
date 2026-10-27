# Vercel deployment guide

The application is a standard Next.js App Router project. The Vercel Next.js
preset builds it without custom build configuration; `vercel.json` only
declares scheduled jobs.

## 1. Environments and Supabase projects

Maintain **two Supabase projects**:

- `terasbarber-staging` — linked from Vercel preview deployments.
- `terasbarber-prod` — linked from the production deployment.

Preview deployments must never hold production keys. Each Vercel environment
gets its own URL/key pair, so a preview cannot read or modify production data.

## 2. Environment variables

Copy `.env.example` and set the variables per Vercel environment
(Project → Settings → Environment Variables).

| Variable | Required | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | yes | New `sb_publishable_...` key; legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY` still works |
| `SUPABASE_SECRET_KEY` | yes | New `sb_secret_...` key; legacy `SUPABASE_SERVICE_ROLE_KEY` still works. Server-only |
| `BOOKING_HASH_SECRET` | yes | `openssl rand -hex 32`; server-only |
| `CRON_SECRET` | yes | `openssl rand -hex 32`; protects scheduled routes |
| `BOOKING_TIMEZONE` | no | Fallback business timezone, default `Asia/Jakarta` |
| `BOOKING_NOTIFICATION_CHANNELS` | no | Comma list, e.g. `telegram,whatsapp` |
| `TELEGRAM_BOT_TOKEN` | for Telegram | Server-only |
| `WHATSAPP_API_TOKEN` | for WhatsApp | Server-only |
| `WHATSAPP_PHONE_NUMBER_ID` | for WhatsApp | Server-only |
| `WHATSAPP_API_VERSION` | no | Default `v21.0` |
| `NEXT_PUBLIC_SITE_URL` | yes | Canonical origin for Auth redirects |
| `SUPABASE_ACCESS_TOKEN` | CI only | CLI token for `db push`/type generation; not used by the app |

No secret variable uses the `NEXT_PUBLIC_` prefix. The application boots
without credentials and renders setup notices, but production validation
(`validateProductionEnv()`) reports every missing required variable.

## 3. Deploy workflow

1. Push the branch to GitHub and open a pull request.
2. Import the repository into Vercel (root directory, Next.js preset).
3. Add the **staging** Supabase variables to the Preview environment and the
   production variables to Production.
4. Apply reviewed migrations to staging:

   ```sh
   npm exec supabase -- link --project-ref STAGING_REF
   npm exec supabase -- db push
   npm run gen:types           # verify the committed types match
   ```

5. Run the full check suite locally or in CI:

   ```sh
   npm run typecheck && npm run lint && npm test && npm run build
   ```

6. Deploy the preview. Verify:
   - `GET /api/health` returns `database: ok`.
   - A synthetic booking persists and appears in `/admin/bookings`.
   - Anonymous access to `/admin` redirects to the login page.
   - `GET /api/cron/process-notifications` without a secret returns 401.
   - Telegram/WhatsApp test messages arrive for synthetic recipients and rows
     appear in `notification_jobs` / `notification_logs`.
7. Back up production, apply the same migrations to the production Supabase
   project, then promote the deployment.
8. Configure Supabase Auth Site URL and redirect URLs for the production
   domain, create the administrator Auth user and attach the admin profile
   (see [DATABASE.md](./DATABASE.md)).
9. Confirm HTTPS, security headers, domain and `/api/health` in production.

## 4. Scheduled jobs (Vercel Cron)

`vercel.json` declares:

| Path | Schedule | Purpose |
| --- | --- | --- |
| `/api/cron/process-notifications` | every 15 minutes | Deliver queued Telegram/WhatsApp jobs with retries |
| `/api/cron/maintenance` | hourly | Enqueue reminders; expire stale pending bookings |

### Authorization

Vercel Cron cannot attach custom headers, so the routes accept:

1. `Authorization: Bearer <CRON_SECRET>` — recommended for external schedulers;
2. `?secret=<CRON_SECRET>` — usable from the Vercel dashboard cron editor;
3. the platform `x-vercel-cron: 1` header, only trusted when `VERCEL=1`.

Committing secrets into `vercel.json` is intentionally avoided. If you use the
query-secret option, create the cron entry in the Vercel dashboard (where the
path is not committed) or keep the secret in a private deployment-only config.

### Plan limits and alternatives

Vercel Hobby plans historically restrict cron frequency (daily schedules) and
function duration. The 15-minute/hourly schedules require a Pro plan. On a plan
that cannot express them, keep the same routes and drive them from an external
scheduler:

- Supabase `pg_cron` calling a Postgres HTTP function,
- GitHub Actions scheduled workflows with the bearer token,
- cron-job.org / a small always-on worker calling the bearer-protected URLs.

Jobs are idempotent and lease-based, so duplicate or overlapping invocations
are safe: claimed rows are locked, stale leases are recovered, and reminder
enqueue uses unique idempotency keys.

## 5. Observability

- `/api/health` — readiness probe for uptime monitors.
- Vercel function logs show booking RPC failures, worker summaries and
  provider errors. Logs include error codes and job ids, never message
  content, recipients, tokens or full customer records.
- Dead-letter review: `select * from notification_jobs where status = 'dead'`
  joined to `notification_logs` for the delivery history.
