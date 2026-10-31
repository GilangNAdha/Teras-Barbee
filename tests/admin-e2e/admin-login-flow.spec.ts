import { expect, test } from '@playwright/test';

test('username and password create a session and open the admin dashboard', async ({ page }) => {
  await page.goto('/admin/login');
  await page.getByLabel('Username').fill('  FIXTURE-TEAM  ');
  await page.getByLabel('Password').fill('fixture-only-password');
  await page.getByRole('button', { name: 'Sign in securely' }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByText('Fixture Owner')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Admin navigation' })).toBeVisible();
});

test('an existing email account still signs in', async ({ page }) => {
  await page.goto('/admin/login');
  await page.getByLabel('Username').fill('fixture-team@admin.terasbarber.invalid');
  await page.getByLabel('Password').fill('fixture-only-password');
  await page.getByRole('button', { name: 'Sign in securely' }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByText('Fixture Owner')).toBeVisible();
});

test('incorrect credentials do not create a session', async ({ page }) => {
  await page.goto('/admin/login');
  await page.getByLabel('Username').fill('fixture-team');
  await page.getByLabel('Password').fill('incorrect-password');
  await page.getByRole('button', { name: 'Sign in securely' }).click();
  await expect(page).toHaveURL(/\/admin\/login\?error=credentials$/);
  await expect(page.locator('p[role="alert"]')).toHaveText('Sign in failed. Check your username and password.');
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/admin\/login(?:\?.*)?$/);
});
