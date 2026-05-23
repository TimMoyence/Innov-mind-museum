/**
 * UFR-022 red phase — PR-15 single-use email token helper unit tests.
 * RUN_ID: 2026-05-23-pr-15-singleUseEmailToken.
 *
 * Behavioural unit tests for the crypto helper extracted in the green phase
 * to `@shared/security/single-use-email-token`. The helper is the single
 * source of truth for generating + hashing the single-use email tokens used by
 * verify-email / forgot-password / reset-password / change-email /
 * confirm-email-change (audit B3-#1). Surface = SECURITY CRITICAL: behaviour
 * MUST stay byte-identical to the inline `randomBytes(32)` →
 * `sha256(raw).hex` pattern it replaces (spec R3).
 *
 * Pre-green: this file imports `@shared/security/single-use-email-token`, which
 * does NOT exist yet → `pnpm test` exits ≠ 0 (module resolution failure).
 * This proves the helper's absence (spec R4.4 / AC9). After the green phase
 * adds the module, every assertion below must pass, byte-frozen.
 *
 * Independent recompute: each expectation recomputes the SHA-256 digest with
 * the native `node:crypto` module (NOT the helper), so a silent drift in the
 * helper's entropy/algo/encoding (spec R3.1-R3.3) would surface as a mismatch
 * rather than tautologically passing.
 *
 * Frozen-test discipline (UFR-022): this file is sha256-hashed in
 * red-test-manifest.json. Green phase MUST NOT modify it. Suspected bug →
 * emit `BLOCK-TEST-WRONG <file>:<line> <reason>` and STOP.
 *
 * Spec sources of truth:
 *   .claude/skills/team/team-state/2026-05-23-pr-15-singleUseEmailToken/spec.md  R1.1-R1.2, R3, AC2/AC3/AC9/AC10
 *   .claude/skills/team/team-state/2026-05-23-pr-15-singleUseEmailToken/design.md §2, §4.1
 *   .claude/skills/team/team-state/2026-05-23-pr-15-singleUseEmailToken/tasks.md  T8
 */
import { createHash } from 'node:crypto';

import { issueEmailToken, hashEmailTokenForLookup } from '@shared/security/single-use-email-token';

/**
 * Independent SHA-256 hex recompute — must NOT call the helper.
 * @param value
 */
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
    // Hashes differ too, since hash is a pure function of raw.
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
    // Legacy generation site computed the persisted hash as sha256(raw) with no
    // trim; hashForLookup(raw, {trim:false}) must reproduce it byte-for-byte.
    const legacyInline = sha256Hex(raw);
    expect(hashEmailTokenForLookup(raw, { trim: false })).toBe(legacyInline);
    expect(hashEmailTokenForLookup(raw, { trim: false })).toBe(hashed);
  });
});
