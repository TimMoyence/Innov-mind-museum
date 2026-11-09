import { buildContextSection, generateNonce } from '@modules/chat/useCase/llm/llm-sections';

describe('generateNonce — Spotlighting per-request nonce (T2.3)', () => {
  it('returns a 16-character lowercase hex string', () => {
    const nonce = generateNonce();
    expect(nonce).toMatch(/^[0-9a-f]{16}$/);
  });

  it('produces 100 distinct nonces over 100 successive calls (cryptographic uniqueness)', () => {
    const nonces = new Set<string>();
    for (let i = 0; i < 100; i++) {
      nonces.add(generateNonce());
    }
    expect(nonces.size).toBe(100);
  });
});

describe('buildContextSection — Spotlighting envelope (T2.3)', () => {
  const FIXED_NONCE = 'abc123def4567890';

  it('wraps facts with [BEGIN UNTRUSTED EXTERNAL DATA — nonce=HEX] and [END ...] markers', () => {
    const section = buildContextSection(['fact1', 'fact2'], 'wikidata', FIXED_NONCE);
    expect(section).toContain(`[BEGIN UNTRUSTED EXTERNAL DATA — nonce=${FIXED_NONCE}]`);
    expect(section).toContain(`[END UNTRUSTED EXTERNAL DATA — nonce=${FIXED_NONCE}]`);
  });

  it('includes every fact verbatim inside the envelope', () => {
    const section = buildContextSection(
      ['Mona Lisa was painted by Leonardo da Vinci.', 'The Louvre acquired it in 1797.'],
      'wikidata',
      FIXED_NONCE,
    );
    expect(section).toContain('Mona Lisa was painted by Leonardo da Vinci.');
    expect(section).toContain('The Louvre acquired it in 1797.');
  });

  it('places the BEGIN marker before any fact and the END marker after every fact', () => {
    const section = buildContextSection(['alpha', 'omega'], 'web', FIXED_NONCE);
    const beginIdx = section.indexOf(`[BEGIN UNTRUSTED EXTERNAL DATA — nonce=${FIXED_NONCE}]`);
    const endIdx = section.indexOf(`[END UNTRUSTED EXTERNAL DATA — nonce=${FIXED_NONCE}]`);
    const alphaIdx = section.indexOf('alpha');
    const omegaIdx = section.indexOf('omega');
    expect(beginIdx).toBeGreaterThanOrEqual(0);
    expect(endIdx).toBeGreaterThan(beginIdx);
    expect(alphaIdx).toBeGreaterThan(beginIdx);
    expect(omegaIdx).toBeGreaterThan(alphaIdx);
    expect(endIdx).toBeGreaterThan(omegaIdx);
  });

  it.each([
    ['wikidata' as const],
    ['web' as const],
    ['museum-catalog' as const],
    ['commons' as const],
  ])(
    'emits the envelope for source=%s and surfaces the source label inside the block',
    (source) => {
      const section = buildContextSection(['fact'], source, FIXED_NONCE);
      expect(section).toContain(`nonce=${FIXED_NONCE}`);
      expect(section).toContain(source);
    },
  );

  it('returns an empty string when facts is an empty array (no envelope emitted)', () => {
    const section = buildContextSection([], 'wikidata', FIXED_NONCE);
    expect(section).toBe('');
  });

  it("returns an empty string when source is 'none' (no facts to wrap)", () => {
    const section = buildContextSection(['unused'], 'none', FIXED_NONCE);
    expect(section).toBe('');
  });

  it('uses the exact nonce passed by the caller (in-band integrity — no rewrite)', () => {
    const customNonce = '0123456789abcdef';
    const section = buildContextSection(['fact'], 'wikidata', customNonce);
    expect(section).toContain(`nonce=${customNonce}`);
    expect(section).not.toContain('nonce=' + FIXED_NONCE);
  });

  it('produces a different envelope per nonce (verifies replay-resistance scaffold)', () => {
    const a = buildContextSection(['fact'], 'wikidata', 'aaaaaaaaaaaaaaaa');
    const b = buildContextSection(['fact'], 'wikidata', 'bbbbbbbbbbbbbbbb');
    expect(a).not.toEqual(b);
  });
});
