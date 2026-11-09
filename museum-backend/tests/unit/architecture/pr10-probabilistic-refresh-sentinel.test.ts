import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BACKEND_ROOT = resolve(__dirname, '../../..');

const TARGETS: readonly string[] = [
  'src/shared/http/overpass-cache.ts',
  'src/shared/http/nominatim.client.ts',
];

const FORBIDDEN_PATTERNS: readonly { label: string; rx: RegExp }[] = [
  { label: 'Math.random() call (TTL-jitter formula)', rx: /\bMath\.random\s*\(/ },
  { label: 'EARLY_REFRESH_THRESHOLD identifier', rx: /\bEARLY_REFRESH_THRESHOLD\b/ },
  { label: 'elapsedRatio = elapsedMs / ttlMs derivation', rx: /\belapsedRatio\b/ },
];

const SHARED_HELPER_IMPORT =
  /import\s*(?:type\s+)?\{[^}]*\b(?:shouldEarlyRefresh|createBackgroundRefresh|RefreshableEntry)\b[^}]*\}\s*from\s+['"]@shared\/cache\/probabilistic-refresh['"]/;

function readTarget(relPath: string): string {
  const abs = resolve(BACKEND_ROOT, relPath);
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

describe('PR-10 sentinel — sweep targets contain no probabilistic-refresh algorithm fingerprint', () => {
  describe.each(TARGETS)('%s', (relPath) => {
    it.each(FORBIDDEN_PATTERNS)(
      'does not contain the forbidden pattern: $label',
      ({ label, rx }) => {
        const source = readTarget(relPath);
        const match = findFirstMatch(source, rx);
        if (match) {
          throw new Error(
            `PR-10 sweep regression in ${relPath}:${match.line}\n` +
              `  forbidden pattern: ${label}\n` +
              `  offending line   : ${match.snippet}\n` +
              `  remediation      : delegate to @shared/cache/probabilistic-refresh`,
          );
        }
        expect(rx.test(source)).toBe(false);
      },
    );
  });
});

describe('PR-10 sentinel — sweep targets import from the shared helper', () => {
  it.each(TARGETS)(
    '%s imports at least one symbol from `@shared/cache/probabilistic-refresh`',
    (relPath) => {
      const source = readTarget(relPath);
      expect(source).toMatch(SHARED_HELPER_IMPORT);
    },
  );
});
