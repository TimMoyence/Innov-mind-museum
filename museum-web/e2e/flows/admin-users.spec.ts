import { test, expect } from '@playwright/test';
import { getAdminCreds } from '../fixtures/auth';

test('admin can list users and the seeded admin appears', async ({ page }) => {
  const { email } = getAdminCreds();
  await page.goto('/en/admin/users');

  await expect(page.getByRole('heading', { name: /users|utilisateurs/i })).toBeVisible();

  await expect(page.getByRole('cell', { name: email })).toBeVisible({ timeout: 10_000 });
});

test('admin can filter users by search', async ({ page }) => {
  const { email } = getAdminCreds();
  await page.goto('/en/admin/users');

  await expect(page.getByRole('cell', { name: email })).toBeVisible({ timeout: 10_000 });

  const search = page
    .getByPlaceholder(/search/i)
    .or(page.getByRole('searchbox'))
    .or(page.getByLabel(/search|rechercher/i));
  await search.first().fill('e2e-admin');

  await expect(page.getByRole('cell', { name: email })).toBeVisible({ timeout: 5_000 });

  await search.first().fill('zzzz-no-match-zzzz');
  await expect(page.getByRole('cell', { name: email })).toBeHidden({ timeout: 5_000 });
});
