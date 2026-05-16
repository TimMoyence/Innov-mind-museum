/**
 * R1 RED — module-boundary sentinel for the mobile paywall feature
 * (T1.12 — R in brief, fused with R sentinel + AC10/AC11/AC13).
 *
 * Pins R1 §1 R30 + N2 + AC10 + AC11 + AC13 down BEFORE implementation :
 *  - No file under `features/paywall/` imports from `features/chat/` (R30 +
 *    N2 strict isolation per `tracking.md` chat-ux guardrail).
 *  - No file under `features/paywall/` references `BottomSheetRouter`
 *    (AC13 — RN `<Modal>` only ; BottomSheetRouter is chat-ux territory).
 *  - The directory exists (otherwise the green agent skipped T2 partially).
 *
 * MUST FAIL at baseline `cd7e22bc` — `features/paywall/` does not exist yet,
 * so the `existsSync` precondition fails. Once the directory lands in T2,
 * the sentinel keeps every future file under it free of chat-ux imports.
 */
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
      // Catch require() too — defense in depth.
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
