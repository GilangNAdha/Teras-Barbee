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
```

Database tests use the local Supabase stack (Docker required):

```sh
npm exec supabase -- start
npm run test:db
npm exec supabase -- stop
```

## Supabase setup

1. Create a Supabase project. Copy its project URL, publishable/anon key, and **server-only** service-role key into `.env.local`. Generate `BOOKING_HASH_SECRET` with `openssl rand -hex 32`. Never commit `.env.local`, send the service key to a browser, or prefix it with `NEXT_PUBLIC_`.
2. Apply all pending migrations with `supabase db push` (linked project) or the local `supabase start` workflow. The migrations create the schema, indexes, Storage bucket, RLS policies, booking/availability and secure booking-management RPCs, private barber WhatsApp contacts, rate limiting, audit history, customer management-link hashes, and database-level overlap guards.
3. In Supabase Auth, create the first owner account manually. Public sign-up is disabled. Copy that user's Auth UUID and add the administrator profile from the SQL editor:

   ```sql
   insert into public.profiles (id, role, full_name)
   values ('AUTH_USER_UUID', 'admin', 'Shop owner');
   ```

   Replace the example values; do not make ordinary staff administrators unless they need full dashboard access.
4. Sign in at `/admin/login`. Use **Shop setup** to enter the verified shop name/contact information, timezone, WhatsApp number, weekly opening hours, minimum notice/horizon, and customer cancellation/reschedule deadlines. Add active services (choose Haircut, Combo, or Beard category) and barber profiles, assign each barber's services, optionally publish a barber WhatsApp contact, experience years, portrait, and verified cut-preview image, then publish approved gallery images. The public menu filters the actual published services; the homepage lookbook uses actual visible gallery records. No production content is seeded.
5. Configure Supabase Auth's Site URL and redirect URL for the deployed Vercel domain. Keep email/password sign-in enabled for administrators, public sign-up disabled, and use strong unique passwords (MFA is recommended in Supabase Auth).

Individual barber hours can be added in `public.barber_hours`; when no barber-specific schedule exists for a weekday, that barber uses the shop's opening hours. Booking slots are generated in the configured shop timezone at 30-minute start intervals and are only shown when the complete service fits before closing.

## Booking and security behavior

- `/book` is a four-step, mobile-first Indonesian flow: select service; choose a barber/date/time; enter customer details and consent; review the full price/duration/time summary before submitting. Barber/date changes fetch live Supabase availability, and a slot conflict sends the customer back to the time step.
- The browser only reads public rows protected by RLS. Customer appointment rows have no anon read access.
- The booking route validates all fields with Zod, requires the server-only Supabase service key and HMAC secret, hashes the platform client IP before database rate limiting, and calls a protected RPC. The service-role key never enters client code.
- PostgreSQL validates active service/barber assignments, booking horizon, advance notice, shop/barber hours, and overlapping intervals. The time-slot result contains the exact eligible barber ID; that ID is saved on the appointment and shown in the admin dashboard/history. A barber-specific WhatsApp contact is preferred for the post-booking message; if none is set, the configured shop WhatsApp is used. The contact table itself is admin-only; a WhatsApp link is server-rendered on public profiles only when the shop explicitly configures that barber’s public contact.
- Advisory locks and a trigger serialize conflicting writes; admin confirmation is also checked for conflicts. When no barber is selected, assignment is deterministic: the first available barber by configured `sort_order`, then name. Pending requests hold an interval for 30 minutes and the shop must confirm via its dashboard/WhatsApp. Admins can review and filter the paginated archive at `/admin/bookings`.
- On success, customers receive a high-entropy, 90-day management link at `/manage-booking/[token]`. The raw token is returned once; PostgreSQL stores only its SHA-256 hash. Customers can view their booking, cancel, or reschedule with the same barber, subject to admin-configured deadlines. The database rechecks schedule, notice, service eligibility, and conflicts in the same transaction; failed reschedules leave the original appointment unchanged. Appointment creation, status changes, cancellations, reschedules, and admin revocations are audit logged. Admins can revoke links from booking history.
- The current WhatsApp follow-up is a customer-clicked `wa.me` link, not automatic delivery. Telegram, WhatsApp Business API, notification outbox processing, and scheduled reminders still require provider/worker implementation and credentials; the app does not claim those messages were sent.
- Supabase Auth uses `@supabase/ssr` cookie sessions refreshed by Next's `proxy.ts`. Admin pages, server actions, APIs, RLS policies, and Storage writes all verify admin authorization.
- Gallery files are limited to supported image types and 8 MB. The `shop-media` bucket is public-read for published photography but admin-write only.

The barber directory uses the interactive React Bits Lanyard profile card. Its component source and MIT + Commons Clause notice are included at `src/components/lanyard.tsx` and `licenses/REACT_BITS_LICENSE.md`; Three.js is dynamically loaded on the client. Barber preview photos and experience values are shop-entered, not seeded.

## Vercel deployment

Import this repository into Vercel using the Next.js preset. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `BOOKING_HASH_SECRET`, and `NEXT_PUBLIC_SITE_URL` in Vercel's production/preview environments. Apply all pending migrations to the target Supabase project, configure Auth Site URL/redirects, provision an admin, then complete the shop setup before sharing the booking link. Redeploy after environment changes.

Review and replace the generated temporary hero image at `public/images/barber-hero.jpg` and the category illustration images in `public/images/service-*.jpg` with licensed Terasbarber photography before launch. Service images set by the admin override these category fallbacks. The `/map` page only embeds a map after an address is configured. Complete/review `src/app/privacy/page.tsx` and verify all service, staff, address, timezone, opening-hour, Instagram, and WhatsApp details with the business owner before launch.

## Validation status

`npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` are the application checks. The SQL suite is in `supabase/tests/booking.sql`. `npm run test:db` needs Docker/local Supabase; it could not be executed in this workspace because no local database is running. Playwright specs are in `tests/e2e`; install the Chromium browser before running them.
