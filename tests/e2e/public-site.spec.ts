import { expect, test } from '@playwright/test';

test('homepage renders the editorial hero, booking CTA, and public navigation', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /raw precision/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /book/i }).first()).toHaveAttribute('href', '/book');
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
  await expect(page.getByRole('link', { name: /find us/i }).first()).toHaveAttribute('href', '/map');
});

test('the Book a chair button stays black and readable in default and hover states', async ({ page }) => {
  await page.goto('/');
  const button = page.getByRole('link', { name: 'Book a chair', exact: true }).first();
  await expect(button).toHaveCSS('color', 'rgb(0, 0, 0)');
  await expect(button).toHaveCSS('background-color', 'rgb(215, 255, 56)');
  await button.hover();
  await expect(button).toHaveCSS('color', 'rgb(0, 0, 0)');
  await expect(button).toHaveAttribute('href', '/book');
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

for (const width of [320, 375, 390, 430, 519, 520, 767]) {
  test(`public pages do not overflow a ${width}px viewport`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ['/', '/services', '/barbers', '/gallery', '/map', '/book']) {
      await page.goto(path);
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      const dimensions = await page.evaluate(() => ({ header: document.querySelector('header')!.getBoundingClientRect().width, footer: document.querySelector('footer')!.getBoundingClientRect().width }));
      expect(dimensions).toEqual({ header: width, footer: width });
    }
    const nav = page.getByRole('navigation', { name: 'Main navigation' });
    for (const name of ['Home', 'Services', 'Barbers', 'Gallery', 'Find us', 'Book now']) {
      await expect(nav.getByRole('link', { name, exact: true })).toBeVisible();
    }
    await expect(nav.getByRole('button', { name: 'Open menu' })).toHaveCount(0);
    const linkBounds = await nav.locator('.pill-nav-link').evaluateAll(links => links.map(link => {
      const bounds = link.getBoundingClientRect();
      const face = link.querySelector('.pill-nav-face')!.getBoundingClientRect();
      return { left: bounds.left, right: bounds.right, width: bounds.width, height: bounds.height, faceLeft: face.left, faceRight: face.right };
    }));
    for (const link of linkBounds) {
      expect(link.left).toBeGreaterThanOrEqual(0);
      expect(link.right).toBeLessThanOrEqual(width);
      expect(link.width).toBeGreaterThanOrEqual(44);
      expect(link.height).toBeGreaterThanOrEqual(44);
      expect(link.faceLeft).toBeGreaterThanOrEqual(link.left - 0.5);
      expect(link.faceRight).toBeLessThanOrEqual(link.right + 0.5);
    }
  });
}
