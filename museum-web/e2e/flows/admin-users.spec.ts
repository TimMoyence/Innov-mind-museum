import { test, expect } from '@playwright/test';
import { getAdminCreds } from '../fixtures/auth';

test('admin can list users and the seeded admin appears', async ({ page }) => {
  const { email } = getAdminCreds();
  await page.goto('/en/admin/users');

  // Heading rendered
  await expect(page.getByRole('heading', { name: /users|utilisateurs/i })).toBeVisible();

  // Wait for the users list — grid/table semantics OR cards rendering the email
  await expect(page.getByText(email)).toBeVisible({ timeout: 10_000 });
});

test('admin can filter users by search', async ({ page }) => {
  const { email } = getAdminCreds();
  await page.goto('/en/admin/users');

  // Wait for initial load
  await expect(page.getByText(email)).toBeVisible({ timeout: 10_000 });

  // Users page uses <input type="text" placeholder="Search..."> with no label/role.
  // Use getByPlaceholder which matches the actual DOM; fall back to getByRole if
  // a future a11y fix adds a label.
  const search = page
    .getByPlaceholder(/search/i)
    .or(page.getByRole('searchbox'))
    .or(page.getByLabel(/search|rechercher/i));
  await search.first().fill('e2e-admin');

  // Debounced — wait briefly and assert presence
  await expect(page.getByText(email)).toBeVisible({ timeout: 5_000 });

  // Type a fragment that should match nothing
  await search.first().fill('zzzz-no-match-zzzz');
  await expect(page.getByText(email)).toBeHidden({ timeout: 5_000 });
});
