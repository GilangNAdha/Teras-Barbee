import { expect, test } from '@playwright/test';

test('homepage renders the editorial hero, booking CTA, and public navigation', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /raw precision/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /book/i }).first()).toHaveAttribute('href', '/book');
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
  await expect(page.getByRole('link', { name: /find us/i }).first()).toHaveAttribute('href', '/map');
});

test('public routes have database-driven empty states without leaking demo data', async ({ page }) => {
  await page.goto('/services');
  await expect(page.getByRole('heading', { name: /the service list/i })).toBeVisible();
  const emptyState = page.getByText(/no published services yet/i);
  const firstService = page.locator('article.card').first();
  await expect(emptyState.or(firstService)).toBeVisible();
});

test('barber directory uses bookable profiles or an honest setup state', async ({ page }) => {
  await page.goto('/barbers');
  await expect(page.getByRole('heading', { name: /meet your barber/i })).toBeVisible();
  const showcase = page.getByRole('region', { name: 'Resident barber profiles' });
  const emptyProfiles = page.getByText(/bookable barber profiles are being prepared/i);
  await expect(showcase.or(emptyProfiles)).toBeVisible();
});

test('map page shows verified location data or an honest setup state', async ({ page }) => {
  await page.goto('/map');
  await expect(page.getByRole('heading', { name: /come through/i })).toBeVisible();
  const mapFrame = page.locator('iframe[title^="Map showing"]');
  const emptyLocation = page.getByText(/location not published yet/i);
  await expect(mapFrame.or(emptyLocation)).toBeVisible();
});

test('booking page is presented in English', async ({ page }) => {
  await page.goto('/book');
  await expect(page.getByRole('heading', { name: /book.*your chair/i })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Booking progress' })).toBeVisible();
  await expect(page.getByText('Book an appointment')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Bahasa Indonesia' })).toHaveCount(0);
});

test('desktop navigation tracks the current page without overflowing', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('/services');
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  await expect(nav.getByRole('link', { name: 'Services' })).toHaveAttribute('aria-current', 'page');
  await nav.getByRole('link', { name: 'Gallery' }).click();
  await expect(page).toHaveURL(/\/gallery$/);
  await expect(nav.getByRole('link', { name: 'Gallery' })).toHaveAttribute('aria-current', 'page');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('mobile menu opens, closes with Escape, and navigates', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  const toggle = page.getByRole('button', { name: 'Open menu' });
  const nav = page.getByRole('navigation', { name: 'Main navigation', includeHidden: true });
  await expect(nav).toBeHidden();
  await toggle.click();
  await expect(nav).toBeVisible();
  await expect(page.getByRole('button', { name: 'Close menu' })).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await expect(nav).toBeHidden();
  await expect(toggle).toBeFocused();
  await toggle.click();
  await nav.getByRole('link', { name: 'Find us' }).click();
  await expect(page).toHaveURL(/\/map$/);
  await expect(nav).toBeHidden();
  await toggle.click();
  await expect(nav.getByRole('link', { name: 'Find us' })).toHaveAttribute('aria-current', 'page');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('booking endpoints reject oversized and non-JSON requests', async ({ request }) => {
  const unsupported = await request.post('/api/bookings', { data: 'test', headers: { 'content-type': 'text/plain' } });
  expect(unsupported.status()).toBe(415);
  const oversized = await request.post('/api/bookings', { data: JSON.stringify({ notes: 'x'.repeat(17000) }), headers: { 'content-type': 'application/json' } });
  expect(oversized.status()).toBe(413);
  const response = await request.get('/manage-booking/not-a-valid-token');
  expect(response.headers()['referrer-policy']).toBe('no-referrer');
  expect(response.headers()['cache-control']).toContain('no-store');
});
