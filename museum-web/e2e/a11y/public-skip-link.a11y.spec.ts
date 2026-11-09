import { test, expect } from '@playwright/test';
import { expectNoA11yViolations } from './_helpers';

test.use({ storageState: { cookies: [], origins: [] } });

for (const route of ['/en', '/fr'] as const) {
  test(`skip-link is the first focusable element on ${route} and moves focus to #main`, async ({
    page,
  }) => {
    await page.goto(route);
    await page.waitForLoadState('networkidle');

    const focusable = page.locator(
      'a[href], button, input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    const first = focusable.first();
    await expect(first).toHaveRole('link');
    await expect(first).toHaveAttribute('href', '#main');

    await expect(page.locator('[tabindex]:not([tabindex="-1"]):not([tabindex="0"])')).toHaveCount(
      0,
    );

    const accessibleName = (await first.textContent())?.trim() ?? '';
    expect(accessibleName.length).toBeGreaterThan(0);

    await first.focus();
    await expect(first).toBeFocused();
    await page.keyboard.press('Enter');
    const main = page.locator('main#main');
    await expect(main).toBeVisible();
  });

  test(`skip-link route ${route} has no WCAG 2.1 AA violations`, async ({ page }) => {
    await page.goto(route);
    await page.waitForLoadState('networkidle');
    await expectNoA11yViolations(page, route);
  });
}
