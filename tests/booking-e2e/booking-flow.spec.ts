import { expect, test, type Page } from '@playwright/test';

async function noHorizontalOverflow(page: Page) {
  await expect.poll(() => page.evaluate(() => ({ viewport: document.documentElement.clientWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }))).toEqual({
    viewport: page.viewportSize()!.width, document: page.viewportSize()!.width, body: page.viewportSize()!.width
  });
}

async function selectServicesAndTime(page: Page) {
  await page.goto('/book');
  const cut = page.getByRole('button', { name: /classic cut/i });
  const beard = page.getByRole('button', { name: /beard trim/i });
  await cut.click(); await beard.click();
  await expect(cut).toHaveAttribute('aria-pressed', 'true');
  await expect(beard).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText(/2 services selected/i)).toBeVisible();
  await page.getByRole('button', { name: 'Choose a barber' }).click();
  await expect(page.getByRole('button', { name: /any available barber/i })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: /Adi Pratama/i })).toContainText('Available today');
  await expect(page.getByRole('button', { name: /Bima Putra/i })).toHaveCount(0); // Bima does not offer the beard service.
  await page.getByRole('button', { name: 'Choose date & time' }).click();
  const dates = page.getByRole('group', { name: 'Available dates' });
  const firstAvailable = dates.locator('button:not([disabled])').first();
  await expect(firstAvailable).toBeVisible();
  await firstAvailable.click();
  await expect(page.getByRole('button', { name: '09:30, unavailable' })).toBeDisabled();
  await page.getByRole('button', { name: '09:00', exact: true }).click();
  await page.getByRole('button', { name: 'Your details' }).click();
}

async function fillDetailsAndReview(page: Page) {
  await page.getByRole('button', { name: 'Review booking' }).click();
  await expect(page.getByText(/please enter your full name/i)).toBeVisible();
  await expect(page.getByText(/enter a valid WhatsApp number/i)).toBeVisible();
  await page.getByLabel(/full name/i).fill('Raka Pratama');
  await page.getByLabel(/WhatsApp number/i).fill('+62 812 3456 7890');
  await page.getByLabel(/note for your barber/i).fill('A little shorter on the sides.');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Review booking' }).click();
  await expect(page.getByRole('heading', { name: /review your booking/i })).toBeVisible();
  await expect(page.locator('.booking-review-details')).toContainText('65.000');
  await expect(page.locator('.booking-review-details')).toContainText('75 min');
  await expect(page.locator('.booking-review-services')).toContainText('Classic cut');
  await expect(page.locator('.booking-review-services')).toContainText('Beard trim');
}

for (const width of [320, 375, 390, 430, 1440]) {
  test(`public layout and booking steps fit at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/services');
    await noHorizontalOverflow(page);
    if (width < 640) {
      const navigation = page.getByRole('navigation', { name: 'Main navigation' });
      for (const name of ['Home', 'Services', 'Barbers', 'Gallery', 'Find us', 'Book now']) {
        await expect(navigation.getByRole('link', { name, exact: true })).toBeVisible();
      }
      await expect(navigation.getByRole('button', { name: 'Open menu' })).toHaveCount(0);
      await noHorizontalOverflow(page);
    }
    await selectServicesAndTime(page);
    await noHorizontalOverflow(page);
    await fillDetailsAndReview(page);
    await noHorizontalOverflow(page);
    const widths = await page.evaluate(() => ({ header: document.querySelector('header')!.getBoundingClientRect().width, footer: document.querySelector('footer')!.getBoundingClientRect().width }));
    expect(widths.header).toBe(width);
    expect(widths.footer).toBe(width);
  });
}

test('service filters and deep links keep the selected service', async ({ page }) => {
  await page.goto('/services');
  await page.getByRole('button', { name: 'Beard', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Classic cut' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Beard trim' })).toBeVisible();
  await page.getByRole('link', { name: 'Book Beard trim' }).click();
  await expect(page).toHaveURL(/\/book\?service=/);
  await expect(page.getByRole('heading', { name: /choose your barber/i })).toBeVisible();
  await page.getByRole('button', { name: /service/i }).first().click();
  await expect(page.getByRole('button', { name: /beard trim/i })).toHaveAttribute('aria-pressed', 'true');
});

test('mobile navigation shows desktop links and follows them without a menu', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto('/services');
  const navigation = page.getByRole('navigation', { name: 'Main navigation' });
  for (const name of ['Home', 'Services', 'Barbers', 'Gallery', 'Find us', 'Book now']) {
    await expect(navigation.getByRole('link', { name, exact: true })).toBeVisible();
  }
  await expect(navigation.getByRole('button', { name: 'Open menu' })).toHaveCount(0);
  await navigation.getByRole('link', { name: 'Book now' }).click();
  await expect(page).toHaveURL(/\/book$/);
  await expect(navigation.getByRole('link', { name: 'Book now' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { name: /book.*your chair/i })).toBeVisible();
  await noHorizontalOverflow(page);
});

test('server-rendered mobile navigation does not cause overflow before hydration', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 320, height: 900 }, javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/services');
  await noHorizontalOverflow(page);
  const navigation = page.getByRole('navigation', { name: 'Main navigation' });
  for (const name of ['Home', 'Services', 'Barbers', 'Gallery', 'Find us', 'Book now']) {
    await expect(navigation.getByRole('link', { name, exact: true })).toBeVisible();
  }
  await context.close();
});

test('calendar errors can be retried without restarting the flow', async ({ page }) => {
  let failCalendar = true;
  await page.route('**/api/availability?*', async route => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('view') === 'calendar' && failCalendar) {
      failCalendar = false;
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Availability could not be loaded.' }) });
    } else await route.continue();
  });
  await page.goto('/book');
  await page.getByRole('button', { name: /classic cut/i }).click();
  await page.getByRole('button', { name: 'Choose a barber' }).click();
  await page.getByRole('button', { name: 'Choose date & time' }).click();
  await expect(page.locator('.booking-fetch-error')).toContainText('Availability could not be loaded');
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('group', { name: 'Available dates' }).locator('button:not([disabled])').first()).toBeVisible();
});

test('rapid repeat submission sends only one booking request', async ({ page }) => {
  let submissions = 0;
  await page.route('**/api/bookings', async route => {
    submissions++;
    await new Promise(resolve => setTimeout(resolve, 300));
    await route.continue();
  });
  await selectServicesAndTime(page);
  await fillDetailsAndReview(page);
  await page.getByRole('button', { name: 'Confirm request' }).evaluate(button => {
    (button as HTMLButtonElement).click();
    (button as HTMLButtonElement).click();
  });
  await expect(page.getByText(/request received/i)).toBeVisible();
  expect(submissions).toBe(1);
});

test('a lost response can be retried without creating another request', async ({ page }) => {
  const requestIds: string[] = [];
  let first = true;
  await page.route('**/api/bookings', async route => {
    requestIds.push(route.request().postDataJSON().requestId);
    if (first) {
      first = false;
      await route.fetch(); // The server saves it, but the browser loses the response.
      await route.abort('failed');
    } else await route.continue();
  });
  await selectServicesAndTime(page);
  await fillDetailsAndReview(page);
  await page.getByRole('button', { name: 'Confirm request' }).click();
  await expect(page.locator('.booking-notice[role="alert"]')).toContainText('Retry without changing your details');
  await page.getByRole('button', { name: 'Confirm request' }).click();
  await expect(page.getByText(/request received/i)).toBeVisible();
  await expect(page.getByRole('link', { name: /manage booking/i })).toHaveAttribute('href', /\/manage-booking\//);
  expect(requestIds).toHaveLength(2);
  expect(requestIds[0]).toBe(requestIds[1]);
});

test('a conflict returns to refreshed time selection without losing customer details', async ({ page }) => {
  let conflict = true;
  await page.route('**/api/bookings', async route => {
    if (conflict) { conflict = false; await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'That slot was just taken. Pick another time.' }) }); }
    else await route.continue();
  });
  await selectServicesAndTime(page);
  await fillDetailsAndReview(page);
  await page.getByRole('button', { name: 'Confirm request' }).click();
  await expect(page.locator('.booking-notice[role="alert"]')).toContainText('just taken');
  await expect(page.getByRole('heading', { name: /choose date & time/i })).toBeVisible();
  await page.getByRole('button', { name: '10:00', exact: true }).click();
  await page.getByRole('button', { name: 'Your details' }).click();
  await expect(page.getByLabel(/full name/i)).toHaveValue('Raka Pratama');
  await page.getByRole('button', { name: 'Review booking' }).click();
  await page.getByRole('button', { name: 'Confirm request' }).click();
  await expect(page.getByText(/request received/i)).toBeVisible();
});
