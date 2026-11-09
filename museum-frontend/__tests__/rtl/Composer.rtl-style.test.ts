import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Composer.tsx — RTL static guard (R13)', () => {
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
    expect(source).not.toMatch(/\bleft\s*:\s*[1-9]/);
    expect(source).not.toMatch(/\bright\s*:\s*[1-9]/);
  });

  it("contains no textAlign: 'left' or 'right' literal", () => {
    expect(source).not.toMatch(/textAlign\s*:\s*['"]left['"]/);
    expect(source).not.toMatch(/textAlign\s*:\s*['"]right['"]/);
  });
});
