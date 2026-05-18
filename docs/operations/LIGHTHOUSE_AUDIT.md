# Lighthouse + axe-core re-validation — landing page

**Audience:** Musaium web maintainer (TL pre-V1).
**Goal:** Confirm the public landing page (`museum-web/`) still meets the Lighthouse + axe-core gates after the cluster D admin additions (W2.1 / W2.2 / W2.3 / Privacy section) — none of which are on the landing route, but a regression in the global layout or in the privacy page could leak.
**Source of truth for thresholds:** [`museum-web/lighthouserc.json`](../../museum-web/lighthouserc.json) (currently: a11y ≥ 0.90 ERROR, perf ≥ 0.85 WARN, seo ≥ 0.90 WARN, best-practices ≥ 0.85 WARN).
**Last updated:** 2026-05-17. **Audit run:** `2026-05-17-w4-compliance-ops-release` (cluster D, TD4 / W4.1).
**TL executes** — requires a running web server + headless Chrome. The runbook is deterministic; the human runs it.

> **Spec target** — the W4 brief calls for "Lighthouse ≥ 95". Today's `lighthouserc.json` floors are below that (0.90 a11y / 0.85 perf). After this audit, if scores comfortably exceed 0.95 across categories, bump the file to `0.95` on the categories that achieve it; if not, capture the gap as a TD entry and revisit.

---

## 1. Pre-flight

| # | Check | Pass criterion |
|---|---|---|
| 1 | `pnpm install` clean on `museum-web/` | No errors |
| 2 | `pnpm build` succeeds | exits 0 |
| 3 | `pnpm start` boots on `:3001` and serves `/en` | `curl -sI http://localhost:3001/en` returns 200 |
| 4 | `@lhci/cli` installed (`npx lhci --version`) | prints version |
| 5 | Chrome/Chromium reachable on the host | `npx lighthouse --print-config` does not fail |

## 2. Local audit

### 2.1 Lighthouse CI (the gate)

```bash
cd museum-web
pnpm build
pnpm start &            # background; remember the PID
sleep 5                 # wait for the server
npx lhci collect --config=lighthouserc.json
npx lhci assert --config=lighthouserc.json
# capture report:
mkdir -p ../team-state/2026-05-17-w4-compliance-ops-release/evidence
mv .lighthouseci ../team-state/2026-05-17-w4-compliance-ops-release/evidence/lhci-landing-$(date +%Y%m%d-%H%M)
kill %1                 # stop the server
```

Expected: `assert` returns 0 and the 4 categories are ≥ their thresholds.

### 2.2 Per-route axe-core (the Playwright suite already covers admin routes)

The repo already ships axe-core E2E specs under `museum-web/e2e/a11y/`. After the cluster D additions, **add a new spec for the new admin routes** so the gate covers them too. Snippet to copy into `museum-web/e2e/a11y/admin-museums.a11y.spec.ts`:

```ts
import { test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { loginAsAdmin } from './_helpers';   // existing helper

test.describe('admin museums a11y', () => {
  test('museums list', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/en/admin/museums');
    const results = await new AxeBuilder({ page }).analyze();
    test.expect(results.violations).toEqual([]);
  });

  test('new museum form', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/en/admin/museums/new');
    const results = await new AxeBuilder({ page }).analyze();
    test.expect(results.violations).toEqual([]);
  });
});
```

> The branding page needs at least one seed museum to test against; defer that spec until E2E fixtures include a seed museum (tracked as TD-51).

### 2.3 Manual smoke

Open in Chrome DevTools (with no service worker stale cache):

1. `http://localhost:3001/en` — landing
2. `http://localhost:3001/en/privacy` — privacy (touched by Privacy ADR-053 section)
3. `http://localhost:3001/en/admin/museums/new` — new admin route
4. `http://localhost:3001/en/admin/museums/1/branding` — new admin route (with a seed museum)

For each: open Lighthouse → run full audit → snapshot the 4 category scores.

## 3. Targeted fixes (common regressions to look for)

| Category | Common cause | Fix |
|---|---|---|
| Accessibility | New form `<input>` without `<label htmlFor>` | Confirm every input has a paired label (W2.1 / W2.2 already use `htmlFor` — verify via DevTools) |
| Accessibility | Color contrast on new branding preview | Pre-computed via `contrast()` helper; visual check in light + dark themes |
| Accessibility | `aria-label` missing on icon-only buttons | None added in W4 cluster D, but check |
| Performance | Recharts bundle size (`/admin/analytics` only) | Not on landing — should not regress |
| Best-practices | `<img>` without explicit width/height (branding preview) | Preview is admin-only, not on landing — landing should not regress |
| Best-practices | New eslint-disable comments leaking to client bundle | None in the cluster — verify with `grep -r 'eslint-disable' museum-web/src/app/[locale]/admin/museums/` |
| SEO | New page missing meta | Privacy page Edit may have moved meta; verify head tags render |

## 4. Threshold bump procedure (if scores ≥ 0.95)

If all 4 categories on `/en` land at ≥ 0.95 in two consecutive runs:

```diff
-        "categories:performance": ["warn", { "minScore": 0.85 }],
-        "categories:accessibility": ["error", { "minScore": 0.90 }],
-        "categories:seo": ["warn", { "minScore": 0.90 }],
-        "categories:best-practices": ["warn", { "minScore": 0.85 }]
+        "categories:performance": ["warn", { "minScore": 0.95 }],
+        "categories:accessibility": ["error", { "minScore": 0.95 }],
+        "categories:seo": ["warn", { "minScore": 0.95 }],
+        "categories:best-practices": ["warn", { "minScore": 0.95 }]
```

Commit with message `chore(web): tighten Lighthouse gates to 0.95 (W4 W4.1)`. CI will then fail any future regression below 0.95 instead of 0.85.

If only a11y reaches 0.95 (most likely), bump only that line and leave the others at their current floors.

## 5. Done = ?

TD4 (W4.1) is closed when:

- [ ] LHCI assert PASS on `/en` (+ ideally `/en/privacy`).
- [ ] Report archived in `team-state/2026-05-17-w4-compliance-ops-release/evidence/lhci-landing-*/`.
- [ ] New axe Playwright spec for admin museums added (or deferred with TD).
- [ ] Threshold bump applied OR a TD captured if scores fell short.
- [ ] STORY.md updated with the 4 category scores verbatim.

## 6. Findings template

```markdown
## Lighthouse landing re-validation — 2026-05-XX

Scores (run via lhci collect on /en):

| Category | Score | Threshold | Verdict |
|---|---|---|---|
| Performance       | 0.__ | 0.85 | PASS / WARN |
| Accessibility     | 0.__ | 0.90 | PASS / FAIL |
| SEO               | 0.__ | 0.90 | PASS / WARN |
| Best-Practices    | 0.__ | 0.85 | PASS / WARN |

Notable a11y findings:
- …

Threshold bump applied? yes / no — files changed: …
TDs filed: …
```
