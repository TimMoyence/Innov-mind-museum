/**
 * T1.1 / R5 — Regression audit: `algorithms: ['none']` is BANNED in
 * museum-backend/src/.
 *
 * CVE-2022-23540 doctrine (lib-docs/jsonwebtoken/PATTERNS.md §4, §5):
 *   DON'T allow `algorithm: 'none'` unless you genuinely need unsigned tokens.
 *   PATTERNS.md §5: "algorithms is the #1 footgun".
 *
 * This test walks every .ts file under museum-backend/src/ and asserts that
 * neither `algorithms: [..., 'none', ...]` nor `algorithm: 'none'` appears.
 *
 * NOTE (tasks.md T1.1): This test PASSES today (invariant already holds). Its
 * value is as a regression guard — a future PR that introduces `'none'` will
 * fail this test and stop on CI. The ast-grep rule (T1.7) is the compile-time
 * guard; this test is the runtime (Jest) guard for defence in depth.
 *
 * Frozen-test invariant: this file is immutable byte-for-byte once committed.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * Recursively collect all *.ts files under a directory.
 * @param dir
 */
function collectTsFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      results.push(...collectTsFiles(full));
    } else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) {
      results.push(full);
    }
  }
  return results;
}

const SRC_ROOT = path.resolve(__dirname, '../../../src');

describe('R5 — "none" algorithm ban across museum-backend/src/', () => {
  const files = collectTsFiles(SRC_ROOT);

  it('finds at least one TypeScript source file to scan (self-check)', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it('R5.A — no algorithms array contains the string "none"', () => {
    // Matches: algorithms: ['none'] or algorithms: ["none"] or algorithms: [..., 'none', ...]
    const noneInArrayPattern = /algorithms\s*:\s*\[.*['"]none['"].*\]/;

    const violations: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const [lineIndex, line] of source.split('\n').entries()) {
        if (noneInArrayPattern.test(line)) {
          violations.push(`${path.relative(SRC_ROOT, file)}:${lineIndex + 1}: ${line.trim()}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('R5.B — no single-string algorithm option set to "none"', () => {
    // Matches: algorithm: 'none' or algorithm: "none"
    const singleNonePattern = /\balgorithm\s*:\s*['"]none['"]/;

    const violations: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const [lineIndex, line] of source.split('\n').entries()) {
        if (singleNonePattern.test(line)) {
          violations.push(`${path.relative(SRC_ROOT, file)}:${lineIndex + 1}: ${line.trim()}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
