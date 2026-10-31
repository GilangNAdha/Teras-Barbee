import { expect, test, type Page } from '@playwright/test';

const routes = [
  { path: '/', label: 'Home' },
  { path: '/services', label: 'Services' },
  { path: '/barbers', label: 'Barbers' },
  { path: '/gallery', label: 'Gallery' },
  { path: '/map', label: 'Find us' },
  { path: '/book', label: 'Book now' }
];

function collectHydrationErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && /hydrat|server[- ]rendered|text content did not match|react error #418/i.test(message.text())) {
      errors.push(message.text());
    }
  });
  return errors;
}

test('development chunks use no-store and reload without cached validators', async ({ page, request }) => {
  const response = await page.goto('/');
  expect(response?.headers()['cache-control']).toContain('no-store');

  const assets = await page.locator('script[src*="/_next/static/"], link[rel="stylesheet"][href*="/_next/static/"]')
    .evaluateAll(elements => elements.map(element => element.getAttribute('src') ?? element.getAttribute('href')));
  expect(assets.length).toBeGreaterThan(0);
  for (const asset of assets) {
    expect(asset).toBeTruthy();
    const assetResponse = await request.head(asset!);
    expect(assetResponse.ok(), `Failed to load ${asset}`).toBeTruthy();
    expect(assetResponse.headers()['cache-control'], `Unexpected cache policy for ${asset}`).toContain('no-store');
  }

  const script = await page.locator('script[src*="/_next/static/"]').first().getAttribute('src');
  expect(script).toBeTruthy();
  const scriptUrl = new URL(script!, page.url()).href;
  const reloadScript = page.waitForResponse(result => result.url() === scriptUrl && result.request().resourceType() === 'script');
  await page.reload();
  const reloaded = await reloadScript;
  expect(reloaded.status()).toBe(200);
  const requestHeaders = await reloaded.request().allHeaders();
  expect(requestHeaders['if-none-match']).toBeUndefined();
  expect(requestHeaders['if-modified-since']).toBeUndefined();
});

test('opening the mobile menu before hydration preserves its state without warnings', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  const errors = collectHydrationErrors(page);
  let resumeScripts = () => {};
  const scriptsPaused = new Promise<void>(resolve => { resumeScripts = resolve; });
  await page.route('**/_next/static/**/*.js', async route => {
    await scriptsPaused;
    await route.continue();
  });

  try {
    await page.goto('/services', { waitUntil: 'commit' });
    const menu = page.locator('.site-mobile-menu');
    await menu.locator('summary').click();
    await expect(menu).toHaveJSProperty('open', true);
    await expect(menu.getByRole('link', { name: 'Services', exact: true })).toBeVisible();
  } finally {
    resumeScripts();
  }

  const menu = page.locator('.site-mobile-menu');
  await expect(menu.getByRole('link', { name: 'Services', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(menu).toHaveJSProperty('open', true);
  expect(errors).toEqual([]);
});

for (const width of [320, 520, 1440]) {
  test(`header hydrates and navigates without errors at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors = collectHydrationErrors(page);

    for (const { path, label } of routes) {
      await page.goto(path);
      const nav = page.getByRole('navigation', { name: 'Main navigation' });
      if (width < 768) {
        const menu = nav.locator('details');
        await expect(menu).toHaveJSProperty('open', false);
        await menu.locator('summary').click();
        await expect(nav.locator('.site-mobile-menu-panel a')).toHaveCount(routes.length);
      } else {
        await expect(nav.locator('.pill-nav-link')).toHaveCount(routes.length);
        await expect(nav.locator('summary')).toHaveCount(0);
      }
      await expect(nav.getByRole('link', { name: label, exact: true })).toHaveAttribute('aria-current', 'page');
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    }

    // A normal reload and client navigation must not restore a stale header.
    await page.reload();
    const nav = page.getByRole('navigation', { name: 'Main navigation' });
    if (width < 768) await nav.locator('summary').click();
    await expect(nav.getByRole('link', { name: 'Book now', exact: true })).toHaveAttribute('aria-current', 'page');
    await nav.getByRole('link', { name: 'Services', exact: true }).click();
    await expect(page).toHaveURL(/\/services$/);
    if (width < 768) {
      await expect(nav.locator('details')).toHaveJSProperty('open', false);
      await nav.locator('summary').click();
    }
    await expect(nav.getByRole('link', { name: 'Services', exact: true })).toHaveAttribute('aria-current', 'page');
    expect(errors).toEqual([]);
  });
}
