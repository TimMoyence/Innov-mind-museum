/**
 * Admin user detail journey (P0 #9 — audit-2026-05-12).
 *
 * Covers the happy path : seeded admin loads the user list, clicks the
 * detail row link, lands on /admin/users/:id, sees identity + status
 * sections, opens the change-role modal, and verifies the modal renders
 * with the expected affordances. Mutation flows that require super_admin
 * (suspend / unsuspend / delete) are NOT exercised here — those are unit-
 * tested at the Vitest level and require a super_admin storage state we
 * do not seed in the smoke flow.
 */
import { test, expect } from '@playwright/test';

import { getAdminCreds } from '../fixtures/auth';

test('admin opens a user detail page from the list', async ({ page }) => {
  const { email } = getAdminCreds();

  await page.goto('/en/admin/users');

  // Wait for the list to render with the seeded admin's row visible.
  await expect(page.getByText(email)).toBeVisible({ timeout: 10_000 });

  // Each row exposes a "View" link to /admin/users/:id (admin + moderator + super_admin).
  // Pair the click with waitForURL — Next.js dev compiles the dynamic [id] route
  // on first hit (cold compile can exceed the default 5s expect timeout in CI).
  const viewLink = page.getByRole('link', { name: /view user details/i }).first();
  await Promise.all([
    page.waitForURL(/\/admin\/users\/\d+$/, { timeout: 30_000 }),
    viewLink.click(),
  ]);

  // Identity + Status sections rendered.
  await expect(page.getByRole('heading', { level: 2, name: /identity/i })).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByRole('heading', { level: 2, name: /status/i })).toBeVisible();

  // Email field visible (the operator viewing their own seeded account).
  await expect(page.getByText(email)).toBeVisible();
});

test('admin opens the change-role modal from detail page', async ({ page }) => {
  const { email } = getAdminCreds();

  await page.goto('/en/admin/users');
  await expect(page.getByText(email)).toBeVisible({ timeout: 10_000 });

  await Promise.all([
    page.waitForURL(/\/admin\/users\/\d+$/, { timeout: 30_000 }),
    page
      .getByRole('link', { name: /view user details/i })
      .first()
      .click(),
  ]);

  const changeRoleBtn = page.getByRole('button', { name: /change role/i });
  await expect(changeRoleBtn).toBeVisible({ timeout: 10_000 });
  await changeRoleBtn.click();

  // Modal mounted with a select labelled "New role" and a Confirm button.
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel(/new role/i)).toBeVisible();
  await expect(dialog.getByRole('button', { name: /confirm/i })).toBeVisible();

  // Escape closes the dialog without committing.
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});
