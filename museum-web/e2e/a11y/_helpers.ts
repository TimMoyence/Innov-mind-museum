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
