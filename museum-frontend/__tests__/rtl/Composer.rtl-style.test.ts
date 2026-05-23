/**
 * Static RTL safety guard for the Composer source file (R13).
 *
 * The repo doctrine (CLAUDE.md "RTL : RN logical-side props") forbids
 * physical-side props in `museum-frontend/features/**` source files. This
 * test reads `Composer.tsx` as raw text and asserts no physical-side prop
 * literal is present.
 *
 * Run: 2026-05-23-chat-composer-buttons-modal-dismiss (UFR-022 red phase).
 *
 * This test is a regression-guard — it PASSES on current Composer.tsx
 * (which is already RTL-safe) and serves to BLOCK the green phase from
 * introducing any `marginLeft/Right`, `paddingLeft/Right`, positional
 * `left:`/`right:`, `borderLeft*`/`borderRight*`, or `textAlign:'left'|
 * 'right'`.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Composer.tsx — RTL static guard (R13)', () => {
  // Resolve from the museum-frontend root. jest.config rootDir = repo root
  // when run via `npm test:rn` (museum-frontend pwd).
  const COMPOSER_PATH = resolve(__dirname, '..', '..', 'features', 'chat', 'ui', 'Composer.tsx');
  const source = readFileSync(COMPOSER_PATH, 'utf8');

  it('contains no marginLeft / marginRight literal', () => {
    expect(source).not.toMatch(/\bmarginLeft\s*:/);
    expect(source).not.toMatch(/\bmarginRight\s*:/);
  });

  it('contains no paddingLeft / paddingRight literal', () => {
    expect(source).not.toMatch(/\bpaddingLeft\s*:/);
    expect(source).not.toMatch(/\bpaddingRight\s*:/);
  });

  it('contains no borderLeftWidth / borderRightWidth / borderLeftColor / borderRightColor literal', () => {
    expect(source).not.toMatch(/\bborderLeftWidth\s*:/);
    expect(source).not.toMatch(/\bborderRightWidth\s*:/);
    expect(source).not.toMatch(/\bborderLeftColor\s*:/);
    expect(source).not.toMatch(/\bborderRightColor\s*:/);
  });

  it('contains no positional left: <non-zero> / right: <non-zero> literal in StyleSheet', () => {
    // Allow `left: 0` and `right: 0` (zero is symmetric).
    expect(source).not.toMatch(/\bleft\s*:\s*[1-9]/);
    expect(source).not.toMatch(/\bright\s*:\s*[1-9]/);
  });

  it("contains no textAlign: 'left' or 'right' literal", () => {
    expect(source).not.toMatch(/textAlign\s*:\s*['"]left['"]/);
    expect(source).not.toMatch(/textAlign\s*:\s*['"]right['"]/);
  });
});
