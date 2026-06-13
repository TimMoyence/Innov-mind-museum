import { type Page, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface DisableRule {
  route: string;
  rule: string;
  reason: string;
  approved_by: string;
}

interface DisableRulesFile {
  rules: DisableRule[];
}

// `__dirname` is undefined under ESM (`"type": "module"` in package.json).
// `import.meta.dirname` is the Node-22 native equivalent.
const __dirname = import.meta.dirname;

let cachedDisable: DisableRulesFile | null = null;
function loadDisableRules(): DisableRulesFile {
  if (cachedDisable) return cachedDisable;
  const path = resolve(__dirname, '_disable-rules.json');
  cachedDisable = JSON.parse(readFileSync(path, 'utf-8')) as DisableRulesFile;
  return cachedDisable;
}

export async function expectNoA11yViolations(page: Page, route: string): Promise<void> {
  const disable = loadDisableRules()
    .rules.filter((r) => r.route === route)
    .map((r) => r.rule);
  // #11 — settle the document <title> before axe runs. On the production build,
  // CI firefox/webkit occasionally evaluate at `networkidle` during the window
  // where React is still hoisting the server-rendered <title> into <head> on
  // hydration (chromium hoists faster), which axe-core flags as [document-title]
  // "non-empty <title>". The title IS server-rendered (verified in the SSR HTML),
  // so this is a hydration-timing artifact, not a real WCAG gap. Waiting for a
  // stable non-empty title makes the gate measure the settled DOM. A *genuinely*
  // missing title is NOT masked: the wait times out (caught) and axe then flags
  // [document-title] as before.
  await page
    .waitForFunction(() => document.title.trim().length > 0, undefined, { timeout: 5_000 })
    .catch(() => {
      /* genuine empty title — fall through; axe will report document-title */
    });
  const builder = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']);
  if (disable.length > 0) builder.disableRules(disable);
  const results = await builder.analyze();
  expect(results.violations, formatViolations(results.violations)).toEqual([]);
}

function formatViolations(
  violations: { id: string; description: string; nodes: { html: string }[] }[],
): string {
  if (violations.length === 0) return '';
  return violations
    .map(
      (v) =>
        `[${v.id}] ${v.description}\n  Nodes:\n${v.nodes.map((n) => `    ${n.html}`).join('\n')}`,
    )
    .join('\n');
}
