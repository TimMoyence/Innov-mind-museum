/**
 * R2 RED tests — CSV injection contract (focused).
 *
 * Pins R2 §1 R15 + §0.5 N8 + AC7 — Risk4 mitigation. Distinct file from
 * `csv-writer.test.ts` so a green-code-agent regression on injection is
 * traceable to a single quick-fail target.
 *
 * MUST FAIL at baseline `a77e48aa`.
 */
import { escapeCsvField } from '@shared/csv/csv-writer';

describe('CSV injection contract (R2 N8 / Risk4)', () => {
  const LEADING_DANGER = ['=', '+', '-', '@'] as const;

  it.each(LEADING_DANGER)('neutralises a leading "%s" with a leading apostrophe', (lead) => {
    const malicious = `${lead}cmd|"powershell"!A1`;
    const escaped = escapeCsvField(malicious);
    expect(escaped.startsWith("'")).toBe(true);
    expect(escaped).toBe(`'${malicious}`);
  });

  it('does NOT touch a regular review comment', () => {
    const benign = 'Great experience at the museum!';
    expect(escapeCsvField(benign)).toBe(benign);
  });

  it('does NOT touch a comment containing `=` in the middle (only leading char triggers)', () => {
    expect(escapeCsvField('rating=4 stars')).toBe('rating=4 stars');
  });

  it('still escapes leading whitespace-tab + CR — full OWASP coverage', () => {
    expect(escapeCsvField('\tcmd')).toBe("'\tcmd");
    expect(escapeCsvField('\rcmd')).toBe("'\rcmd");
  });
});
