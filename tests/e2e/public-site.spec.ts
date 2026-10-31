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

const mobileWidths = [320, 375, 390, 430];
const publicRoutes = ['/', '/services', '/barbers', '/gallery', '/book', '/map', '/privacy'];

for (const width of mobileWidths) {
  test(`no horizontal overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    for (const route of publicRoutes) {
      await page.goto(route);
      const overflow = await page.evaluate(() => {
        const doc = document.documentElement;
        const widest = [...document.querySelectorAll<HTMLElement>('body *')]
          .filter(element => {
            const style = getComputedStyle(element);
            if (style.position === 'fixed' || style.visibility === 'hidden') return false;
            // Content inside its own horizontal scroller is allowed to be wider than the page.
            return !element.closest('.touch-scroll');
          })
          .map(element => element.getBoundingClientRect().right)
          .reduce((max, right) => Math.max(max, right), 0);
        return { scrollWidth: doc.scrollWidth, innerWidth: window.innerWidth, widest };
      });
      expect(overflow.scrollWidth, `${route} scrolls horizontally at ${width}px`).toBeLessThanOrEqual(overflow.innerWidth);
      expect(overflow.widest, `${route} has an element past the right edge at ${width}px`).toBeLessThanOrEqual(overflow.innerWidth + 1);
    }
  });
}

test('header, sections, and footer share the same container edges on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/services');
  const edges = await page.evaluate(() => {
    const pick = (selector: string) => {
      const element = document.querySelector<HTMLElement>(selector);
      const rect = element?.getBoundingClientRect();
      return rect ? { left: Math.round(rect.left), right: Math.round(rect.right) } : null;
    };
    return {
      header: pick('header .page-shell'),
      section: pick('main .page-shell'),
      footer: pick('footer .page-shell')
    };
  });
  expect(edges.header).not.toBeNull();
  expect(edges.section).toEqual(edges.header);
  expect(edges.footer).toEqual(edges.header);
});
