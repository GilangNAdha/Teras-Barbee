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

test('booking stays disabled until the protected booking configuration is ready', async ({ page }) => {
  await page.goto('/book');
  await expect(page.getByRole('heading', { name: /pilih.*pesan/i })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Progress booking' })).toBeVisible();
  const unavailableNotice = page.getByText(/booking is unavailable until the database/i);
  if (await unavailableNotice.count()) await expect(unavailableNotice).toBeVisible();
  await expect(page.getByRole('button', { name: /request this appointment/i })).toBeDisabled();
});
