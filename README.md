# Terasbarber

A full-stack, mobile-first barbershop website and appointment platform built with Next.js App Router, TypeScript, Tailwind CSS, Supabase PostgreSQL/Auth/Storage, Zod, Vitest, and Playwright.

The public site intentionally contains no invented prices, staff, reviews, address, opening hours, or contact number. Services, barbers, gallery media, shop details, and bookable hours come from Supabase. Until the shop owner configures those records and credentials, the app shows setup/empty states and disables live booking.

## Local development

Requirements: Node.js 22.13+ (or Node 24+) and Docker for local Supabase/PostgreSQL tests.

```sh
npm install
cp .env.example .env.local
# Fill in the Supabase values and generate BOOKING_HASH_SECRET.
npm run dev
```

The web app listens on port 3000. To build/check the application:

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

Playwright browser tests:

```sh
npx playwright install chromium
npm run test:e2e
# Isolated fixture: exercises populated booking flows without touching real data.
npm run test:e2e:booking
```

The booking fixture starts a mock Supabase server on port 3101 and a separate Next.js server on port 3100. Stop other Next.js development servers for this repository first so they do not share the `.next` build directory.

Database tests use the local Supabase stack (Docker required):

```sh
npm exec supabase -- start
npm run test:db
npm exec supabase -- stop
```

## Supabase setup

1. Create a Supabase project. Copy its project URL, publishable/anon key, and **server-only** service-role key into `.env.local`. Generate `BOOKING_HASH_SECRET` with `openssl rand -hex 32`. Never commit `.env.local`, send the service key to a browser, or prefix it with `NEXT_PUBLIC_`.
2. Review and apply all pending migrations to the intended project with `supabase db push` (linked project) or the local `supabase start` workflow. The five-step booking flow requires `202610310001_booking_experience.sql`; any earlier pending migration must be applied first. The migrations create the schema, indexes, Storage bucket, RLS policies, booking/availability and secure booking-management RPCs, private barber WhatsApp contacts, rate limiting, audit history, customer management-link hashes, and database-level overlap guards. Do not point the test fixture at a live project.
3. In Supabase Auth, create the first owner account manually. Public sign-up is disabled. Copy that user's Auth UUID and add the administrator profile from the SQL editor:

   ```sql
   insert into public.profiles (id, role, full_name)
   values ('AUTH_USER_UUID', 'admin', 'Shop owner');
   ```

   Replace the example values; do not make ordinary staff administrators unless they need full dashboard access.
4. Sign in at `/admin/login`. Use **Shop setup** to enter the verified shop name/contact information, timezone, WhatsApp number, weekly opening hours, minimum notice/horizon, and customer cancellation/reschedule deadlines. Add active services (choose Haircut, Combo, or Beard category) and barber profiles, assign each barber's services, optionally publish a barber WhatsApp contact, experience years, portrait, and verified cut-preview image, then publish approved gallery images. The public menu filters the actual published services; the homepage lookbook uses actual visible gallery records. No production content is seeded.
5. Configure Supabase Auth's Site URL and redirect URL for the deployed Vercel domain. Keep email/password sign-in enabled for administrators and public sign-up disabled. The admin sign-in uses the Auth email address; a display name such as a username belongs in `profiles.full_name` and is not a separate login credential. Never put an admin password in source control, `.env` files, SQL migrations, or chat. If a password has been shared in plain text, change it immediately in Supabase Auth before deploying or using this account.
6. After signing in, open **Account security** at `/admin/security`. Change the password to a unique passphrase of at least 12 characters and enroll a TOTP authenticator app. Once a verified authenticator is enrolled, protected admin pages and server actions require a valid second-factor session; after password sign-in the dashboard redirects to a code verification step. Keep access to the authenticator and project-owner recovery path. Configure Supabase Auth MFA/TOTP support for the project before relying on this control.

Individual barber hours can be added in `public.barber_hours`; when no barber-specific schedule exists for a weekday, that barber uses the shop's opening hours. Booking slots are generated in the configured shop timezone at 30-minute start intervals and are only shown when the complete service fits before closing.

## Booking and security behavior

- `/book` is a five-step, mobile-first English flow: select one or more services; choose a barber or any available barber; choose an available calendar date and time; enter customer details and consent; then review the full price/duration/time summary. Barber, date, and service changes fetch live Supabase availability; a slot conflict returns the customer to time selection without losing their details.
- The browser only reads public rows protected by RLS. Customer appointment rows have no anon read access.
- The booking route validates all fields with Zod, requires the server-only Supabase service key and HMAC secret, hashes the platform client IP before database rate limiting, and calls a protected RPC. The service-role key never enters client code.
- PostgreSQL calculates the total for up to five services (at most 600 minutes), preserves each service and aggregate price/duration as snapshots, and validates active assignments, booking horizon, advance notice, shop/barber hours, and overlapping intervals. With “any barber,” the server selects an eligible barber who is still free when the request is saved; the assigned barber appears in the admin dashboard/history. A barber-specific WhatsApp contact is preferred for the customer-clicked follow-up; otherwise the configured shop WhatsApp is used. The contact table itself is admin-only; a WhatsApp link is server-rendered on public profiles only when the shop explicitly configures that barber’s public contact.
- Advisory locks and a trigger serialize conflicting writes; admin confirmation is also checked for conflicts. When no barber is selected, assignment is deterministic: the first available barber by configured `sort_order`, then name. Pending requests hold an interval for 30 minutes and the shop must confirm via its dashboard/WhatsApp. Admins can review and filter the paginated archive at `/admin/bookings`.
- On success, customers receive a high-entropy, 90-day management link at `/manage-booking/[token]`. PostgreSQL stores only its SHA-256 hash. A random request ID and server-derived token let an unchanged request be retried after a lost response without creating a second appointment. Keep `BOOKING_HASH_SECRET` stable across deployments: rotating it invalidates this retry mechanism for outstanding requests, though already-issued links continue to work. Customers can view, cancel, or reschedule with the same barber, subject to configured deadlines; an expired pending hold cannot be rescheduled as though it still reserved a slot. The database rechecks schedule, notice, service eligibility, and conflicts in the same transaction; failed reschedules leave the original appointment unchanged. Creation, status changes, cancellations, reschedules, and admin revocations are audit logged.
- The current WhatsApp follow-up is a customer-clicked `wa.me` link, not automatic delivery. Telegram, WhatsApp Business API, notification outbox processing, and scheduled reminders still require provider/worker implementation and credentials; the app does not claim those messages were sent.
- Supabase Auth uses `@supabase/ssr` cookie sessions refreshed by Next's `proxy.ts`. Admin pages, server actions, APIs, RLS policies, and Storage writes all verify admin authorization. The Account security page lets an authenticated administrator update the password and enroll/verify a TOTP authenticator; verified MFA is enforced at the protected admin server boundary (AAL2).
- The admin Finance overview reports completed service-price value, pending/confirmed scheduled value, ticket average, and booking status counts for a selected shop-timezone month. These are booking-derived estimates, **not proof of payment or accounting records**: payment settlement, refunds, discounts, tips, and fees are not modeled. Use a payment provider/accounting ledger for actual cash flow.
- Gallery files are limited to supported image types and 8 MB. The `shop-media` bucket is public-read for published photography but admin-write only.

The barber directory uses the interactive React Bits Lanyard profile card. Its component source and MIT + Commons Clause notice are included at `src/components/lanyard.tsx` and `licenses/REACT_BITS_LICENSE.md`; Three.js is dynamically loaded on the client. Barber preview photos and experience values are shop-entered, not seeded.

## Vercel deployment

Import this repository into Vercel using the Next.js preset. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `BOOKING_HASH_SECRET`, and `NEXT_PUBLIC_SITE_URL` in Vercel's production/preview environments. Apply all pending migrations to the target Supabase project, configure Auth Site URL/redirects, provision an admin, then complete the shop setup before sharing the booking link. Redeploy after environment changes.

Review and replace the generated temporary hero image at `public/images/barber-hero.jpg` and the category illustration images in `public/images/service-*.jpg` with licensed Terasbarber photography before launch. Service images set by the admin override these category fallbacks. The `/map` page only embeds a map after an address is configured. Complete/review `src/app/privacy/page.tsx` and verify all service, staff, address, timezone, opening-hour, Instagram, and WhatsApp details with the business owner before launch.

## Validation status

`npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` are the application checks. The SQL suites in `supabase/tests/booking.sql` and `supabase/tests/booking_experience.sql` cover booking, multi-service snapshots, retries, conflicts, and management; `npm run test:db` expects the local Supabase stack. Playwright specs are in `tests/e2e` and `tests/booking-e2e`; install Chromium before running them. The latter uses isolated fixture data, not production services or customers.
