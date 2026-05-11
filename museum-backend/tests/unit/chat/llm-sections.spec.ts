/**
 * T2.3 — Spotlighting envelope + per-request nonce
 *
 * Tests for `buildContextSection` and `generateNonce` exports of `llm-sections.ts`.
 *
 * Defense: Spotlighting datamarking (Microsoft 2024 CEUR-WS Vol-3920) — wrap
 * untrusted content with a marker token + per-request randomized nonce so the
 * LLM can be instructed to treat the inner block as DATA and never as
 * instructions. Per-request nonce defeats replay-style injections that
 * pre-encode the marker.
 *
 * Spec references:
 *  - spec.md R3 (`[BEGIN UNTRUSTED EXTERNAL DATA — nonce=HEX]...[END ...]`)
 *  - design.md D3 (datamarking with per-request 16-hex-char nonce)
 *  - tasks.md T2.3 DoD (`generateNonce()` = `randomBytes(8).toString('hex')` ;
 *    100/100 distinct over 100 successive calls)
 *  - source plan `docs/plans/2026-05-10-c4-launch-prompt.md` Step 2.3 Green
 *    template
 *
 * Threat model (LLM01:2025 prompt injection) :
 *  - randomBytes from `node:crypto` — CSPRNG, not `Math.random`
 *  - Nonce MUST be fresh per request — no caching, no log emission
 *  - No user-controlled input influences the nonce
 */

import {
  buildContextSection,
  generateNonce,
} from '@modules/chat/useCase/llm/llm-sections';

describe('generateNonce — Spotlighting per-request nonce (T2.3)', () => {
  it('returns a 16-character lowercase hex string', () => {
    const nonce = generateNonce();
    // randomBytes(8) → 8 bytes → 16 hex chars, hex alphabet [0-9a-f]
    expect(nonce).toMatch(/^[0-9a-f]{16}$/);
  });

  it('produces 100 distinct nonces over 100 successive calls (cryptographic uniqueness)', () => {
    // DoD: 100/100 distinct. 2^64 entropy means a collision is astronomically
    // improbable; if this ever flakes the CSPRNG is broken.
    const nonces = new Set<string>();
    for (let i = 0; i < 100; i++) {
      nonces.add(generateNonce());
    }
    expect(nonces.size).toBe(100);
  });
});

describe('buildContextSection — Spotlighting envelope (T2.3)', () => {
  const FIXED_NONCE = 'abc123def4567890'; // 16 hex chars, deterministic for assertion

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
  ])('emits the envelope for source=%s and surfaces the source label inside the block', (source) => {
    const section = buildContextSection(['fact'], source, FIXED_NONCE);
    expect(section).toContain(`nonce=${FIXED_NONCE}`);
    // The source label is surfaced inside the inner <untrusted_content> tag so
    // the LLM (and downstream debugging) can see where the data came from.
    expect(section).toContain(source);
  });

  it('returns an empty string when facts is an empty array (no envelope emitted)', () => {
    const section = buildContextSection([], 'wikidata', FIXED_NONCE);
    // DoD: empty facts → no markers (no point wrapping zero data).
    expect(section).toBe('');
  });

  it("returns an empty string when source is 'none' (no facts to wrap)", () => {
    // DoD documented decision: source='none' = nothing to wrap = empty string,
    // identical to the empty-facts case. The orchestrator MUST NOT inject an
    // empty envelope into the prompt (it would waste tokens and offer the LLM
    // an attack surface marker with no defensive content).
    const section = buildContextSection(['unused'], 'none', FIXED_NONCE);
    expect(section).toBe('');
  });

  it('uses the exact nonce passed by the caller (in-band integrity — no rewrite)', () => {
    const customNonce = '0123456789abcdef';
    const section = buildContextSection(['fact'], 'wikidata', customNonce);
    // No silent regeneration — the orchestrator owns the nonce lifecycle.
    expect(section).toContain(`nonce=${customNonce}`);
    expect(section).not.toContain('nonce=' + FIXED_NONCE);
  });

  it('produces a different envelope per nonce (verifies replay-resistance scaffold)', () => {
    const a = buildContextSection(['fact'], 'wikidata', 'aaaaaaaaaaaaaaaa');
    const b = buildContextSection(['fact'], 'wikidata', 'bbbbbbbbbbbbbbbb');
    expect(a).not.toEqual(b);
  });
});
