import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const TEST_DIR = __dirname;
const SELF = '_legacy-meta-sentinel.test.ts';
const FORBIDDEN_LITERAL = '[META]';

const PERMITTED_ASSERTION_LINE = new RegExp(
  String.raw`\.not\.(?:toContain|toMatch)\(\s*(?:` +
    String.raw`'\[META\]'|` +
    String.raw`"\[META\]"|` +
    String.raw`/\\?\[META\\?\]/` +
    String.raw`)\s*\)`,
  'g',
);

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
      continue;
    }
    if (!name.endsWith('.ts')) continue;
    if (full === join(TEST_DIR, SELF)) continue;
    out.push(full);
  }
  return out;
}

function scrub(content: string): string {
  return content.replace(PERMITTED_ASSERTION_LINE, '');
}

describe('C9.17 — legacy [META] sentinel (Step A)', () => {
  it('no test file in tests/unit/chat fabricates the legacy [META] wire format', () => {
    const files = walk(TEST_DIR);
    const offenders = files
      .filter((f) => {
        const scrubbed = scrub(readFileSync(f, 'utf8'));
        return scrubbed.includes(FORBIDDEN_LITERAL);
      })
      .map((f) => relative(TEST_DIR, f))
      .sort();

    if (offenders.length > 0) {
      throw new Error(
        `C9.17 sentinel — ${offenders.length} file(s) still emit the legacy ` +
          `[META] wire format:\n  - ${offenders.join('\n  - ')}\n` +
          `Migrate each fake to return structured output (see tasks.md T1.2).`,
      );
    }
    expect(offenders).toEqual([]);
  });
});
