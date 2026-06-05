import { test } from '@playwright/test';
import { expectNoA11yViolations } from './_helpers';

// T-WEB-1 (RED) — C2 / S-WEB. The NPS dashboard route `/admin/nps` does not
// exist yet (R24). Navigating there today renders the Next.js 404, which axe
// flags (and the route never paints the NPS widget the spec requires). This
// spec is materialised RED-first per design-c2.md §7 "Web a11y (mandatory
// test-first)"; it turns green once `app/[locale]/admin/nps/page.tsx` exists
// and is WCAG 2.1 AA clean.
test('admin NPS page has no WCAG 2.1 AA violations', async ({ page }) => {
  await page.goto('/en/admin/nps');
  await page.waitForLoadState('networkidle');
  await expectNoA11yViolations(page, '/en/admin/nps');
});
