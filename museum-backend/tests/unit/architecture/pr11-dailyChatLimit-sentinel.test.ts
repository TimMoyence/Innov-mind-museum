import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BACKEND_ROOT = resolve(__dirname, '../../..');

const TARGET_REL = 'src/shared/middleware/daily-chat-limit.middleware.ts';

const FORBIDDEN_PATTERNS: readonly { label: string; rx: RegExp }[] = [
  { label: 'cache.get( call (race read-write pattern)', rx: /\bcache\.get\s*[<(]/ },
  { label: 'cache.set( call (race read-write pattern)', rx: /\bcache\.set\s*\(/ },
  {
    label: 'setDailyChatLimitCacheService declaration (boot wiring removed)',
    rx: /\bsetDailyChatLimitCacheService\b/,
  },
];

const SHARED_FACTORY_IMPORT =
  /import\s*(?:type\s+)?\{[^}]*\bcreateRateLimitMiddleware\b[^}]*\}\s*from\s+['"]@shared\/middleware\/rate-limit\.middleware['"]/;

function readTarget(): string {
  const abs = resolve(BACKEND_ROOT, TARGET_REL);
  return readFileSync(abs, 'utf8');
}

function findFirstMatch(source: string, rx: RegExp): { line: number; snippet: string } | null {
  const lines = source.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    if (rx.test(line)) {
      return { line: i + 1, snippet: line.trim() };
    }
  }
  return null;
}

describe('PR-11 sentinel — daily-chat-limit.middleware.ts contains no race-prone cache pattern or deprecated wiring', () => {
  it.each(FORBIDDEN_PATTERNS)('does not contain the forbidden pattern: $label', ({ label, rx }) => {
    const source = readTarget();
    const match = findFirstMatch(source, rx);
    if (match) {
      throw new Error(
        `PR-11 migration regression in ${TARGET_REL}:${match.line}\n` +
          `  forbidden pattern: ${label}\n` +
          `  offending line   : ${match.snippet}\n` +
          `  remediation      : migrate to createRateLimitMiddleware({...}) per design §3.1`,
      );
    }
    expect(rx.test(source)).toBe(false);
  });
});

describe('PR-11 sentinel — daily-chat-limit.middleware.ts imports the shared rate-limit factory', () => {
  it(`imports createRateLimitMiddleware from \`@shared/middleware/rate-limit.middleware\``, () => {
    const source = readTarget();
    expect(source).toMatch(SHARED_FACTORY_IMPORT);
  });
});
