/**
 * R5 (C7.1) — TTS voice round-trip in `pnpm smoke:api`.
 *
 * Spec : docs/roadmap-night/specs/R5.md §1 (EARS R1..R12) + §2 (AC1..AC10).
 *
 * Per §5/T1 recommendation (a), this is a STATIC contract test :
 * we read `museum-backend/scripts/smoke-api.cjs` as text and grep
 * for the shape R5 must introduce. No execution, no network, no fixture.
 *
 * These assertions MUST fail at baseline `d203877f6` (script has no TTS
 * stage yet). They MUST pass once green-code-agent lands T2.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// `describe`, `it`, `expect` are provided as globals by Jest + @types/jest.
// Explicit imports from `@jest/globals` are intentionally avoided — the
// package is not installed here (jest@29 ships globals via the test runner).

const SMOKE_SCRIPT_PATH = resolve(__dirname, '../../../scripts/smoke-api.cjs');

const readScript = (): string => readFileSync(SMOKE_SCRIPT_PATH, 'utf8');

describe('smoke-api.cjs — R5 TTS contract (static grep)', () => {
  describe('R3 / D5 — POST /api/chat/messages/:messageId/tts is exercised', () => {
    it('source references the TTS endpoint path template', () => {
      const src = readScript();
      // The exact template literal from §3.1 :
      //   `/api/chat/messages/${assistantMessageId}/tts`
      // We check for the stable suffix to avoid binding to the variable name.
      expect(src).toMatch(/\/api\/chat\/messages\/\$\{[A-Za-z0-9_]+\}\/tts/);
    });

    it('source declares a fetchBinary helper for binary responses (D5)', () => {
      const src = readScript();
      // §3.6 D5 mandates a new local helper `fetchBinary` because fetchJson
      // would `JSON.parse` an MP3 buffer and throw. Either a function decl
      // or a const arrow form is acceptable.
      expect(src).toMatch(
        /(?:function\s+fetchBinary\s*\(|const\s+fetchBinary\s*=|async\s+function\s+fetchBinary\s*\()/,
      );
    });
  });

  describe('R1 — chat POST drives the assistant reply that R5 then synthesizes', () => {
    it('source posts to /api/chat/sessions/:id/messages with a fixed FR prompt', () => {
      const src = readScript();
      expect(src).toMatch(/\/api\/chat\/sessions\/\$\{[A-Za-z0-9_]+\}\/messages/);
      // The §3.1 fixed prompt — textbook art topic so guardrails pass.
      expect(src).toContain('Bonjour, parle-moi de la Joconde.');
    });
  });

  describe('AC9 — happy-path log line shape', () => {
    it('source emits a "tts OK" log token (currently absent at baseline)', () => {
      const src = readScript();
      // The contract token, used by CI greppers to identify the stage.
      expect(src).toMatch(/\[smoke:api\]\s+tts OK/);
    });

    it('source builds the log line in the exact AC9 format', () => {
      const src = readScript();
      // The regex below mirrors the AC9 contract :
      //   /^\[smoke:api\] tts OK \(bytes=\d+, contentType=audio\/[a-z0-9.+\-]+, msgId=[0-9a-f]{8}\)$/
      // We assert the source CONSTRUCTS such a string. We look for the
      // three tokens (bytes, contentType, msgId) inside a template literal
      // alongside the `tts OK` prefix.
      expect(src).toMatch(/bytes=\$\{[^}]+\}/);
      expect(src).toMatch(/contentType=\$\{[^}]+\}/);
      expect(src).toMatch(/msgId=\$\{[^}]+\}/);
    });
  });

  describe('R10 / AC8 — cleanup runs unconditionally via try/finally', () => {
    it('a finally block appears AFTER the "tts OK" log token (anchors cleanup to TTS region)', () => {
      const src = readScript();
      // Baseline already has `} finally {` in fetchJson / fetchMultipart /
      // ensureLogin (lines 97/151/182) for AbortController cleanup — those
      // are NOT the R10 contract. R10 requires the TTS stage itself to be
      // wrapped so the DELETE cleanup always runs. The simplest unambiguous
      // anchor : at least one `} finally {` must appear AFTER the `tts OK`
      // log token. At baseline `tts OK` is absent → indexOf returns -1 →
      // no finally can be after it → test fails. Post-T2, the try/finally
      // around the TTS block (per §3.1) places a finally after the log.
      const idxTts = src.indexOf('tts OK');
      expect(idxTts).toBeGreaterThan(-1);
      const tail = idxTts >= 0 ? src.slice(idxTts) : '';
      expect(tail).toMatch(/}\s*finally\s*{/);
    });
  });

  describe('R7 / N3 — fail-loud on 501 FEATURE_UNAVAILABLE', () => {
    it('source carries the exact failure message for unavailable TTS', () => {
      const src = readScript();
      // Per N3 + R7, the message MUST be literal :
      //   "[smoke:api] FAIL: TTS unavailable (501 FEATURE_UNAVAILABLE)"
      // We match a robust substring that avoids binding to surrounding quoting
      // or string-template choices.
      expect(src).toMatch(/TTS unavailable \(501 FEATURE_UNAVAILABLE\)/);
    });
  });

  describe('R6 — empty assistant reply (204) surfaces as smoke failure', () => {
    it('source carries the 204 failure message', () => {
      const src = readScript();
      // R6 mandates the literal `[smoke:api] FAIL: TTS returned 204` shape.
      expect(src).toMatch(/TTS returned 204/);
    });
  });

  describe('R4 / D2 — MP3 magic-byte validation is performed inline', () => {
    it('source checks the ID3 prefix (0x49 0x44 0x33)', () => {
      const src = readScript();
      // Accept either the hex form (0x49) or the ascii string form ("ID3").
      const hasHex = /0x49\b[\s\S]{0,60}0x44\b[\s\S]{0,60}0x33\b/.test(src);
      const hasAscii = /['"`]ID3['"`]/.test(src);
      expect(hasHex || hasAscii).toBe(true);
    });

    it('source checks the MPEG frame-sync byte 0xFF', () => {
      const src = readScript();
      // §3.3 D2 second MP3 form: 0xFF followed by 0xF* (frame sync).
      expect(src).toMatch(/0xff/i);
    });
  });

  describe('R5 — minimum byte-length floor (defence against truncation / error envelope)', () => {
    it('source asserts buffer length >= 1024', () => {
      const src = readScript();
      // §1 R5 — literal floor 1024. Don't bind to variable name; just check
      // the number appears in proximity to a length check.
      expect(src).toMatch(
        /(?:length|byteLength)\s*[><=]+\s*1024|1024\s*[><=]+\s*(?:length|byteLength)/,
      );
    });
  });

  describe('AC6 — TTS stage sequenced between compare and cleanup', () => {
    it('"tts OK" log appears between "compare OK" and "cleanup delete session OK" in source', () => {
      const src = readScript();
      const idxCompare = src.indexOf('compare OK');
      const idxTts = src.indexOf('tts OK');
      const idxCleanup = src.indexOf('cleanup delete session OK');
      // Baseline : idxTts === -1. Target : idxCompare < idxTts < idxCleanup.
      expect(idxCompare).toBeGreaterThan(-1);
      expect(idxCleanup).toBeGreaterThan(-1);
      expect(idxTts).toBeGreaterThan(idxCompare);
      expect(idxTts).toBeLessThan(idxCleanup);
    });
  });

  describe('AC9 line-anchored — full single-line regex match', () => {
    it('source contains a console.log template that matches the AC9 contract regex shape', () => {
      const src = readScript();
      // AC9 specifies an exact one-line shape :
      //   [smoke:api] tts OK (bytes=<N>, contentType=audio/<x>, msgId=<8hex>)
      // We assert the source CONSTRUCTS this exact ordering+spacing in a
      // single console.log call (templated). Anchoring all three tokens
      // inside one log invocation prevents a green agent from splitting the
      // log into multiple lines (which would defeat AC9 grep CI tooling).
      expect(src).toMatch(
        /console\.log\([^)]*\[smoke:api\][^)]*tts OK[^)]*bytes=\$\{[^)]*contentType=\$\{[^)]*msgId=\$\{[^)]*\)/,
      );
    });
  });

  // Placeholder for a future pure-helper unit test if green-code-agent extracts
  // the magic-byte validator into its own exported function (e.g. into a
  // sibling `.cjs` so it can be `require`-d). The Design (§3.1) keeps it inline
  // so this is intentionally NOT implemented in T1. If green extraction
  // happens later, replace this `it.todo` with a real test against the
  // exported helper. `it.todo` is the canonical placeholder per Musaium
  // discipline (no `expect(true).toBe(true)`).
  it.todo('validateMp3MagicBytes(buffer) — pure helper test, only if T2 extracts the validator');
});
