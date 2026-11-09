import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const PAYWALL_DIR = resolve(__dirname, '..', '..', '..', 'features', 'paywall');

function listPaywallSources(): string[] {
  if (!existsSync(PAYWALL_DIR)) return [];
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      const s = statSync(full);
      if (s.isDirectory()) {
        if (name === '__tests__' || name === 'node_modules') continue;
        walk(full);
      } else if (/\.(ts|tsx)$/.test(name)) {
        out.push(full);
      }
    }
  };
  walk(PAYWALL_DIR);
  return out;
}

describe('features/paywall module boundary (R1 §1 R30 + N2 + AC10/AC11/AC13)', () => {
  it('features/paywall directory exists', () => {
    expect(existsSync(PAYWALL_DIR)).toBe(true);
  });

  it('AC10: no source file under features/paywall imports from features/chat/', () => {
    const files = listPaywallSources();
    expect(files.length).toBeGreaterThan(0);
    const violations: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      if (/from\s+['"][^'"]*features\/chat[^'"]*['"]/.test(src)) {
        violations.push(file);
      }
      if (/require\(\s*['"][^'"]*features\/chat[^'"]*['"]\s*\)/.test(src)) {
        violations.push(file);
      }
    }
    expect(violations).toEqual([]);
  });

  it('AC13: BottomSheetRouter is NOT imported anywhere under features/paywall/', () => {
    const files = listPaywallSources();
    const violations: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      if (src.includes('BottomSheetRouter')) {
        violations.push(file);
      }
    }
    expect(violations).toEqual([]);
  });

  it('AC11 (mirror) : no source file references the chat (stack) screens', () => {
    const files = listPaywallSources();
    const violations: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      if (src.includes('(stack)/chat')) {
        violations.push(file);
      }
    }
    expect(violations).toEqual([]);
  });
});
