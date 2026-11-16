import { expect, test, type Page } from '@playwright/test';

async function noHorizontalOverflow(page: Page) {
  await expect.poll(() => page.evaluate(() => ({ viewport: document.documentElement.clientWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }))).toEqual({
    viewport: page.viewportSize()!.width, document: page.viewportSize()!.width, body: page.viewportSize()!.width
  });
}

async function chooseKapster(page: Page, name = /Adi Pratama/i) {
  await page.goto('/book');
  const kapster = page.getByRole('button', { name: new RegExp(name.source, 'i') }).first();
  await expect(kapster).toBeVisible();
  await kapster.click();
  await expect(kapster).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Pilih kapster' }).click();
  await expect(page.getByRole('heading', { name: 'Pilih Jadwal' })).toBeVisible();
}

async function chooseSchedule(page: Page) {
  const dates = page.getByRole('group', { name: 'Tanggal tersedia' });
  const firstAvailable = dates.locator('button:not([disabled])').first();
  await expect(firstAvailable).toBeVisible();
  await firstAvailable.click();
  await page.getByRole('button', { name: '09:00', exact: true }).click();
  await page.getByRole('button', { name: 'Pilih jadwal' }).click();
  await expect(page.getByRole('heading', { name: 'Pilih Layanan' })).toBeVisible();
}

async function chooseServicesAndCheckout(page: Page) {
  const cut = page.getByRole('button', { name: /classic cut/i });
  const beard = page.getByRole('button', { name: /beard trim/i });
  await cut.click();
  await beard.click();
  await expect(cut).toHaveAttribute('aria-pressed', 'true');
  await expect(beard).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText(/2 layanan dipilih/i)).toBeVisible();
  await page.getByRole('button', { name: 'Lanjut ke checkout' }).click();
  await expect(page.getByRole('heading', { name: 'Checkout' })).toBeVisible();
}

async function fillCheckout(page: Page, method: 'qris' | 'pay_at_barber' = 'pay_at_barber') {
  await page.getByLabel(/nama lengkap/i).fill('Raka Pratama');
  await page.getByLabel(/nomor whatsapp/i).fill('0812 3456 7890');
  await page.getByLabel(/catatan/i).fill('Agak lebih pendek di samping.');
  await page.getByRole('radio', { name: new RegExp(method === 'qris' ? '^QRIS' : 'Bayar di Barbershop', 'i') }).check();
  await expect(page.locator('.booking-review-details')).toContainText('65.000');
  await expect(page.locator('.booking-review-details')).toContainText('75 menit');
  await page.getByRole('checkbox').check();
}

for (const width of [320, 375, 390, 430, 1440]) {
  test(`public layout and booking steps fit at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/services');
    await noHorizontalOverflow(page);
    if (width < 640) {
      const navigation = page.getByRole('navigation', { name: 'Main navigation' });
      const menu = navigation.locator('details');
      await expect(menu).toHaveJSProperty('open', false);
      await menu.locator('summary').click();
      for (const name of ['Home', 'Services', 'Barbers', 'Gallery', 'Find us', 'Book now']) {
        await expect(navigation.getByRole('link', { name, exact: true })).toBeVisible();
      }
      await noHorizontalOverflow(page);
    }
    await chooseKapster(page);
    await noHorizontalOverflow(page);
    await chooseSchedule(page);
    await noHorizontalOverflow(page);
    await chooseServicesAndCheckout(page);
    await fillCheckout(page);
    await noHorizontalOverflow(page);
    const widths = await page.evaluate(() => ({ header: document.querySelector('header')!.getBoundingClientRect().width, footer: document.querySelector('footer')!.getBoundingClientRect().width }));
    expect(widths.header).toBe(width);
    expect(widths.footer).toBe(width);
  });
}

test('a deep link keeps the selected service when choosing a kapster', async ({ page }) => {
  await page.goto('/services');
  await page.getByRole('button', { name: 'Beard', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Classic cut' })).toHaveCount(0);
  await page.getByRole('link', { name: 'Book Beard trim' }).click();
  await expect(page).toHaveURL(/\/book\?service=/);
  await expect(page.getByRole('heading', { name: 'Pilih Kapster' })).toBeVisible();
  await page.getByRole('button', { name: /Adi Pratama/i }).click();
  await expect(page.getByRole('button', { name: /Adi Pratama/i })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Pilih kapster' }).click();
  await chooseSchedule(page);
  await expect(page.getByRole('button', { name: /beard trim/i })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: /classic cut/i })).toHaveAttribute('aria-pressed', 'false');
});

test('mobile hamburger opens the navigation and closes after following a link', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto('/services');
  const navigation = page.getByRole('navigation', { name: 'Main navigation' });
  const menu = navigation.locator('details');
  await expect(menu).toHaveJSProperty('open', false);
  await menu.locator('summary').click();
  for (const name of ['Home', 'Services', 'Barbers', 'Gallery', 'Find us', 'Book now']) {
    await expect(navigation.getByRole('link', { name, exact: true })).toBeVisible();
  }
  await navigation.getByRole('link', { name: 'Book now' }).click();
  await expect(page).toHaveURL(/\/book$/);
  await expect(menu).toHaveJSProperty('open', false);
  await menu.locator('summary').click();
  await expect(navigation.getByRole('link', { name: 'Book now' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { name: /^booking\.?$/i })).toBeVisible();
  await noHorizontalOverflow(page);
});

test('server-rendered mobile navigation works without JavaScript or overflow', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 320, height: 900 }, javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/services');
  await noHorizontalOverflow(page);
  const navigation = page.getByRole('navigation', { name: 'Main navigation' });
  const menu = navigation.locator('details');
  await menu.locator('summary').click();
  for (const name of ['Home', 'Services', 'Barbers', 'Gallery', 'Find us', 'Book now']) {
    await expect(navigation.getByRole('link', { name, exact: true })).toBeVisible();
  }
  await noHorizontalOverflow(page);
  await navigation.getByRole('link', { name: 'Book now' }).click();
  await expect(page).toHaveURL(/\/book$/);
  await noHorizontalOverflow(page);
  await context.close();
});

test('calendar errors can be retried without restarting the flow', async ({ page }) => {
  let failCalendar = true;
  await page.route('**/api/availability?*', async route => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('view') === 'calendar' && failCalendar) {
      failCalendar = false;
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Jadwal belum bisa dimuat.' }) });
    } else await route.continue();
  });
  await chooseKapster(page);
  await expect(page.locator('.booking-inline-message')).toContainText('Jadwal belum bisa dimuat');
  await page.getByRole('button', { name: 'Bulan berikutnya' }).click();
  await page.getByRole('button', { name: 'Bulan sebelumnya' }).click();
  await expect(page.getByRole('group', { name: 'Tanggal tersedia' }).locator('button:not([disabled])').first()).toBeVisible();
});

test('rapid repeat submission sends only one booking request', async ({ page }) => {
  let submissions = 0;
  await page.route('**/api/bookings', async route => {
    submissions++;
    await new Promise(resolve => setTimeout(resolve, 300));
    await route.continue();
  });
  await chooseKapster(page);
  await chooseSchedule(page);
  await chooseServicesAndCheckout(page);
  await fillCheckout(page);
  await page.getByRole('button', { name: 'Konfirmasi booking' }).evaluate(button => {
    (button as HTMLButtonElement).click();
    (button as HTMLButtonElement).click();
  });
  await expect(page.getByText(/booking diterima/i)).toBeVisible();
  expect(submissions).toBe(1);
});

test('choosing QRIS shows the payment break-down while paying at the barbershop does not', async ({ page }) => {
  await chooseKapster(page);
  await chooseSchedule(page);
  await chooseServicesAndCheckout(page);
  await fillCheckout(page, 'pay_at_barber');
  await page.getByRole('button', { name: 'Konfirmasi booking' }).click();
  await expect(page.getByText(/booking diterima/i)).toBeVisible();
  const paid = page.locator('.booking-success-payment');
  await expect(paid).toContainText('Bayar di Barbershop');
  await expect(paid).toContainText('65.000');
  await expect(page.getByRole('link', { name: /kelola booking/i })).toHaveAttribute('href', /\/manage-booking\//);
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
  await chooseKapster(page);
  await chooseSchedule(page);
  await chooseServicesAndCheckout(page);
  await fillCheckout(page);
  await page.getByRole('button', { name: 'Konfirmasi booking' }).click();
  await expect(page.locator('.booking-notice[role="alert"]')).toContainText('Coba kirim ulang');
  await page.getByRole('button', { name: 'Konfirmasi booking' }).click();
  await expect(page.getByText(/booking diterima/i)).toBeVisible();
  await expect(page.getByRole('link', { name: /kelola booking/i })).toHaveAttribute('href', /\/manage-booking\//);
  expect(requestIds).toHaveLength(2);
  expect(requestIds[0]).toBe(requestIds[1]);
});

test('a conflict returns to refreshed schedule selection without losing customer details', async ({ page }) => {
  let conflict = true;
  await page.route('**/api/bookings', async route => {
    if (conflict) { conflict = false; await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'That slot was just taken. Pick another time.' }) }); }
    else await route.continue();
  });
  await chooseKapster(page);
  await chooseSchedule(page);
  await chooseServicesAndCheckout(page);
  await fillCheckout(page);
  await page.getByRole('button', { name: 'Konfirmasi booking' }).click();
  await expect(page.locator('.booking-notice[role="alert"]')).toContainText('baru saja diambil');
  await expect(page.getByRole('heading', { name: 'Pilih Jadwal' })).toBeVisible();
  await page.getByRole('button', { name: '10:00', exact: true }).click();
  await page.getByRole('button', { name: 'Pilih jadwal' }).click();
  await page.getByRole('button', { name: 'Lanjut ke checkout' }).click();
  await expect(page.getByRole('heading', { name: 'Checkout' })).toBeVisible();
  await expect(page.getByLabel(/nama lengkap/i)).toHaveValue('Raka Pratama');
  await page.getByRole('button', { name: 'Konfirmasi booking' }).click();
  await expect(page.getByText(/booking diterima/i)).toBeVisible();
});
