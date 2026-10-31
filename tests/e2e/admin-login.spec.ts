import { expect, test } from '@playwright/test';

test('admin login presents a username field and handles invalid input safely', async ({ page }) => {
  await page.goto('/admin/login');
  const username = page.getByLabel('Username');
  const password = page.getByLabel('Password');
  await expect(username).toHaveAttribute('type', 'text');
  await expect(username).toHaveAttribute('autocomplete', 'username');
  await expect(password).toHaveAttribute('type', 'password');
  await expect(page.getByText('Existing email-based administrators can also use their email.', { exact: false })).toBeVisible();

  await username.fill('invalid username');
  await password.fill('fixture-password');
  await page.getByRole('button', { name: 'Sign in securely' }).click();
  await expect(page).toHaveURL(/\/admin\/login\?error=invalid$/);
  await expect(page.locator('p[role="alert"]')).toHaveText('Enter a valid username and password.');
});
