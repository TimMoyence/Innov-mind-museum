import { createHash } from 'node:crypto';

import { issueEmailToken, hashEmailTokenForLookup } from '@shared/security/single-use-email-token';

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

const HEX_64 = /^[a-f0-9]{64}$/;

describe('issueEmailToken()', () => {
  it('returns a raw token of 64 lowercase hex chars (32 bytes)', () => {
    const { raw } = issueEmailToken();
    expect(raw).toMatch(HEX_64);
  });

  it('returns hashed = sha256(raw) in 64-char hex', () => {
    const { raw, hashed } = issueEmailToken();
    expect(hashed).toMatch(HEX_64);
    expect(hashed).toBe(sha256Hex(raw));
  });

  it('produces a different raw token on each call (real entropy)', () => {
    const a = issueEmailToken();
    const b = issueEmailToken();
    expect(a.raw).not.toBe(b.raw);
    expect(a.hashed).not.toBe(b.hashed);
  });
});

describe('hashEmailTokenForLookup()', () => {
  it('trims by default → sha256(trimmed) (verify-email / confirm-email-change)', () => {
    expect(hashEmailTokenForLookup(' abc ')).toBe(sha256Hex('abc'));
  });

  it('with { trim: false } hashes the raw string verbatim (reset-password C2 no-trim)', () => {
    expect(hashEmailTokenForLookup(' abc ', { trim: false })).toBe(sha256Hex(' abc '));
  });

  it('trim:false differs from the trimmed result for whitespace-padded input', () => {
    expect(hashEmailTokenForLookup(' abc ', { trim: false })).not.toBe(
      hashEmailTokenForLookup(' abc '),
    );
  });

  it('byte-identical parity with legacy inline `sha256(issue().raw)` (no-trim path)', () => {
    const { raw, hashed } = issueEmailToken();
    const legacyInline = sha256Hex(raw);
    expect(hashEmailTokenForLookup(raw, { trim: false })).toBe(legacyInline);
    expect(hashEmailTokenForLookup(raw, { trim: false })).toBe(hashed);
  });
});
