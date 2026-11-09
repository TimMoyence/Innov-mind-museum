import { test } from '@playwright/test';
import { expectNoA11yViolations } from './_helpers';

const SEED_USER_ID = '1';

test('admin user-detail page (en) has no WCAG 2.1 AA violations with tier toggle', async ({
  page,
}) => {
  await page.goto(`/en/admin/users/${SEED_USER_ID}`);
  await page.waitForLoadState('networkidle');
  await expectNoA11yViolations(page, `/en/admin/users/${SEED_USER_ID}`);
});

test('admin user-detail page (fr) has no WCAG 2.1 AA violations with tier toggle', async ({
  page,
}) => {
  await page.goto(`/fr/admin/users/${SEED_USER_ID}`);
  await page.waitForLoadState('networkidle');
  await expectNoA11yViolations(page, `/fr/admin/users/${SEED_USER_ID}`);
});

test('admin user-detail page (en) has no WCAG 2.1 AA violations with confirm modal open', async ({
  page,
}) => {
  await page.goto(`/en/admin/users/${SEED_USER_ID}`);
  await page.waitForLoadState('networkidle');

  const promote = page.getByRole('button', { name: /Promote to premium/i });
  const demote = page.getByRole('button', { name: /Demote to free/i });
  await promote.or(demote).first().waitFor({ state: 'visible' });
  if (await promote.count()) {
    await promote.first().click();
  } else if (await demote.count()) {
    await demote.first().click();
  }
  await page.getByRole('dialog').waitFor({ state: 'visible' });

  await expectNoA11yViolations(page, `/en/admin/users/${SEED_USER_ID} + tier-confirm-modal`);
});
