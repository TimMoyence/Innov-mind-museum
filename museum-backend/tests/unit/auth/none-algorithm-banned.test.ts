import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

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
