# Supabase database guide

This document covers the PostgreSQL schema, the migration workflow, RLS, local
development and recovery procedures. Application deployment is documented in
[DEPLOYMENT.md](./DEPLOYMENT.md); messaging internals live in
[NOTIFICATIONS.md](./NOTIFICATIONS.md).

## 1. Schema reconciliation

The database was built incrementally, so some required concepts use existing
table and column names. No production table was renamed or dropped; the mapping
below is the source of truth.

| Required concept | Actual implementation |
| --- | --- |
| `profiles.barber_id`, `profiles.updated_at` | Added by `202610290001_notification_outbox.sql` |
| `services.buffer_minutes`, `services.display_order` | `buffer_minutes` is a real column; `display_order` is a stored generated column aliasing the existing `sort_order` |
| `barbers.phone_whatsapp`, `barbers.telegram_chat_id` | Stored in the private `barber_contact_channels` table so they are never exposed by public barber reads |
| `business_settings` | `shop_settings` (single-row table) plus private `notification_settings` for destinations that must never be public |
| `business_hours` | `shop_hours` (weekday 0–6, half-open day definitions) |
| `barber_schedules` | `barber_hours`; falls back to `shop_hours` when no barber row exists |
| `barber_time_off` | `barber_time_off` (leave, holidays, unavailable ranges) |
| `appointments.booking_reference` | `appointments.booking_code` |
| `appointments.customer_notes` | `appointments.notes` |
| `appointments.start_at` / `end_at` | `starts_at` / `ends_at` (`timestamptz`) |
| `appointments.booking_source` | Added column, check constraint `online / admin / walk_in` |
| `management_token_hash` | `appointment_manage_tokens.token_hash` (SHA-256 only; raw token never stored) |
| Notification outbox | `notification_jobs` + `notification_logs` |
| Audit log | `booking_audit_logs` |

All monetary columns are integer rupiah (`BIGINT`-safe `integer`/`BIGINT`
checks, never floating point). All appointment times are `timestamptz`; the
business timezone is `Asia/Jakarta` (configurable per shop in
`shop_settings.timezone`, fallback `BOOKING_TIMEZONE`).

## 2. Migration files

```
supabase/migrations/
├── 202610270001_initial.sql                     # core tables, RLS, booking RPCs, overlap trigger
├── 202610280001_private_barber_contacts.sql     # admin-only barber WhatsApp numbers
├── 202610280002_service_categories.sql
├── 202610280003_barber_profile_highlights.sql
├── 202610280004_booking_management.sql          # snapshots, tokens, audit logs
├── 202610280005_revoke_booking_links.sql
├── 202610290001_notification_outbox.sql         # outbox, time off, exclusion constraint, cron RPCs
└── 202610290002_buffer_timeoff_idempotency.sql  # buffers, time-off checks, idempotent bookings
```

Every migration is additive. The one hard constraint added
(`appointments_barber_no_overlap`, a partial GiST exclusion constraint) is
preceded by a conflict pre-check that fails with a descriptive message and
modifies nothing if overlapping active appointments already exist.

### Booking integrity layers

1. **Validation** — Zod on the server, `CHECK` constraints and the secured
   `create_public_booking` / `manage_public_booking` RPCs in the database.
2. **Advisory locks** — per-client rate limiting and per-barber/per-day slot
   locks serialize concurrent bookings.
3. **Trigger** — `enforce_appointment_no_overlap` maintains the buffer-aware
   `busy_until` range, expires stale pending requests, and rejects overlaps.
4. **Exclusion constraint** — `EXCLUDE USING gist (barber_id WITH =,
   tstzrange(starts_at, busy_until, '[)') WITH &&) WHERE (status IN
   ('pending','confirmed'))` is the database-enforced last line of defence.
   Ranges are half-open, so back-to-back bookings are allowed.
5. **Idempotency** — clients send an `Idempotency-Key`; it is stored in
   `appointments.idempotency_key` with a unique partial index, and retried
   submissions return the original booking instead of duplicating it.

Cancelled and completed appointments are outside the partial exclusion index,
so cancelling always releases the slot. Pending requests hold a slot for 30
minutes and are then expired by the maintenance cron (or opportunistically by
the overlap trigger).

## 3. Local development

Requirements: Node.js 22.13+ and Docker (for the local Supabase stack).

```sh
npm install
cp .env.example .env.local            # fill in local Supabase values
npm exec supabase -- start            # Postgres + Studio + Auth in Docker
npm exec supabase -- db reset         # applies all migrations + supabase/seed.sql
npm run dev
```

`supabase/seed.sql` contains synthetic services, barbers, opening hours and
notification preferences only. It never creates Auth users or secrets. Create
the first administrator manually:

1. Supabase Studio → Authentication → add a user (email + password).
2. Attach the admin profile:

   ```sql
   insert into public.profiles (id, role, full_name)
   values ('AUTH_USER_UUID', 'admin', 'Shop owner');
   ```

Public sign-up stays disabled (`supabase/config.toml` → `enable_signup = false`),
and no API path lets a user assign themselves the `admin` role: profile writes
go through the `Admins manage profiles` RLS policy guarded by `is_admin()`.

## 4. Linking and applying migrations

Use separate Supabase projects for staging and production.

```sh
# One-time link (requires SUPABASE_ACCESS_TOKEN, see .env.example)
npm exec supabase -- login
npm exec supabase -- link --project-ref STAGING_REF

# Review pending migration status
npm exec supabase -- migration list

# Apply reviewed migrations
npm exec supabase -- db push
```

Production flow:

1. Open and review every new migration in the pull request.
2. Apply to staging first and run `npm run test:db`.
3. Back up the production database (Dashboard → Database → Backups).
4. Apply to production with `supabase db push --project-ref PROD_REF`.
5. Verify `/api/health` and a smoke-test booking.

Never run `supabase db reset` against a linked remote project — it drops and
recreates the remote database. The command is local-only.

## 5. Generating TypeScript types

The committed `src/lib/database.types.ts` is kept in sync manually for
reviewability. After schema changes, regenerate against the linked project:

```sh
npm run gen:types     # supabase gen types typescript --linked
```

Review the diff before committing. CI should run `npm run typecheck` to catch
drift.

## 6. RLS and permission tests

RLS is enabled on every table. Anonymous roles have no access to
`appointments`, `notification_jobs`, `notification_logs`,
`barber_time_off`, `notification_settings`, `barber_contact_channels` or
`appointment_manage_tokens`. Public booking happens only through
`security definer` RPCs granted exclusively to `service_role`, each with a
pinned `search_path`, parameter validation and explicit grants.

The pgTAP suite in `supabase/tests/booking.sql` exercises anonymous,
service-role and (via `is_admin()`) administrative contexts, plus overlap,
buffer, time-off, idempotency, outbox, lease and expiry behaviour:

```sh
npm exec supabase -- start
npm run test:db
```

## 7. Health checks and troubleshooting

- `GET /api/health` returns `database: ok` when a service-role query succeeds,
  `not_configured` when env vars are missing, or `error`/HTTP 503 on failure.
- `supabase migration list` shows applied vs pending versions.
- Postgres logs: Dashboard → Logs → Postgres. Look for raised exception codes
  such as `booking_slot_taken`, `shop_closed`, `booking_rate_limited`.
- Migration failure recovery:
  - Fix the SQL, then re-run `supabase db push`; the CLI records each version
    atomically and skips applied files.
  - If a migration partially applied, inspect `supabase_migrations.schema_migrations`,
    manually reconcile the partial objects, and only then mark/repair the
    version. Never resolve a failed migration by resetting a production database.
  - If the exclusion constraint pre-check reports existing overlaps, query the
    conflicting appointments, cancel/reschedule them through the admin
    dashboard, then re-apply the migration.
