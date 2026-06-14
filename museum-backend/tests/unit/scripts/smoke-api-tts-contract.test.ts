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

/**
 * INC-2026-06-14 fail-loud-by-default contract (static grep).
 *
 * These assertions guard the six assertion-strengthening targets that close the
 * INC-2026-06-14 silent-green regression. They are STATIC (read the script text,
 * grep for the shape) — same readFileSync+regex pattern as the TTS contract
 * block above. They MUST fail against the pre-INC-2026-06-14 smoke-api.cjs (which
 * tolerated 503-compare, degraded-health, non-empty modelVersion, and both
 * delete booleans) and pass once the hardening lands.
 */
describe('smoke-api.cjs — INC-2026-06-14 fail-loud contract (static grep)', () => {
  describe('H1-COMPARE-DEFAULT-200 (INV-2) — a 503 compare fails by default', () => {
    it('defaults compare expected to [200] and gates 503 behind SMOKE_COMPARE_ALLOW_ENCODER_DOWN', () => {
      const src = readScript();
      // The named opt-out env must exist and default to 'false'.
      expect(src).toMatch(/SMOKE_COMPARE_ALLOW_ENCODER_DOWN/);
      expect(src).toMatch(
        /getEnv\(\s*['"]SMOKE_COMPARE_ALLOW_ENCODER_DOWN['"]\s*,\s*['"]false['"]\s*\)/,
      );
      // The strict-by-default expected list: [200] when the opt-out is off,
      // [200, 503] only when it is on. Anchor the ternary shape.
      expect(src).toMatch(/allowEncoderDown\s*\?\s*\[\s*200\s*,\s*503\s*\]\s*:\s*\[\s*200\s*\]/);
    });
  });

  describe('H1-COMPARE-MODELVERSION-PINNED (INV-3) — 200 must carry the catalogued model version', () => {
    it('reads SMOKE_EXPECTED_MODEL_VERSION defaulting to the live SigLIP version and asserts equality', () => {
      const src = readScript();
      expect(src).toMatch(
        /getEnv\(\s*['"]SMOKE_EXPECTED_MODEL_VERSION['"]\s*,\s*['"]siglip2-base-patch16-224@v1['"]\s*,?\s*\)/,
      );
      // The assertion must compare the response modelVersion against the
      // expected value (strict !==), not merely check non-empty.
      expect(src).toMatch(/modelVersion\s*!==\s*expectedModelVersion/);
    });

    it('no longer accepts any non-empty modelVersion on a 200 (the old vacuous check is gone)', () => {
      const src = readScript();
      // The pre-INC check `compare.json.modelVersion === ''` thrown a "missing
      // modelVersion" error for empty-only. The new code pins the exact value,
      // so the loose `=== ''`-only gate must be gone.
      expect(src).not.toMatch(/Compare 200 response missing modelVersion/);
    });
  });

  describe('M-SMOKE-HEALTH-REQUIRE-OK (INV-1) — degraded health and redis-down fail by default', () => {
    it('requires status===ok by default and gates degraded behind SMOKE_ALLOW_DEGRADED_HEALTH', () => {
      const src = readScript();
      expect(src).toMatch(
        /getEnv\(\s*['"]SMOKE_ALLOW_DEGRADED_HEALTH['"]\s*,\s*['"]false['"]\s*\)/,
      );
      // The allowed-statuses list is ['ok'] unless the opt-out is on.
      expect(src).toMatch(/\[\s*['"]ok['"]\s*,\s*['"]degraded['"]\s*\]\s*:\s*\[\s*['"]ok['"]\s*\]/);
      // The old "accept ok OR degraded unconditionally" guard must be gone.
      expect(src).not.toMatch(
        /status\s*!==\s*['"]ok['"]\s*&&\s*[A-Za-z0-9_.?]+\s*!==\s*['"]degraded['"]/,
      );
    });

    it('defaults SMOKE_REQUIRE_REDIS to true and distinguishes skipped from down', () => {
      const src = readScript();
      expect(src).toMatch(/getEnv\(\s*['"]SMOKE_REQUIRE_REDIS['"]\s*,\s*['"]true['"]\s*\)/);
      // Explicit skipped vs down branches (distinct messages, INV per contract).
      expect(src).toMatch(/===\s*['"]skipped['"]/);
      expect(src).toMatch(/===\s*['"]down['"]/);
    });
  });

  describe('M-SMOKE-CHAT (INV-4) — length>50 + round-trip GET, citations stay unasserted', () => {
    it('asserts the assistant text length is greater than 50 chars', () => {
      const src = readScript();
      // A real Joconde answer is far longer than 50 chars; a stub/refusal is caught.
      expect(src).toMatch(/\.trim\(\)\.length\s*<=\s*50/);
    });

    it('performs a GET round-trip on the session and finds the persisted assistant message', () => {
      const src = readScript();
      // After the POST, re-read the session and locate the assistant message by id.
      expect(src).toMatch(/method:\s*['"]GET['"]/);
      expect(src).toMatch(
        /\.find\(\s*\(?[A-Za-z0-9_]+\)?\s*=>\s*[A-Za-z0-9_]+\??\.id\s*===\s*assistantMessageId\s*\)/,
      );
      expect(src).toMatch(/chat round-trip OK/);
    });

    it('does NOT assert citations are non-empty (citations is nullable on the healthy path)', () => {
      const src = readScript();
      // Over-asserting citations would false-fail healthy runs (INV-4). Guard
      // against any assertion that throws on empty/missing citations.
      expect(src).not.toMatch(
        /citations[\s\S]{0,80}(?:length\s*===\s*0|missing citations|empty citations)/i,
      );
    });
  });

  describe('M-SMOKE-TTS-GRANULEPOS (INV-5) — decoded audio duration, not just magic bytes', () => {
    it('declares an Ogg granulepos parser and a >=96000-sample (~2s) floor', () => {
      const src = readScript();
      expect(src).toMatch(
        /(?:function\s+readLastOggGranulePos\s*\(|const\s+readLastOggGranulePos\s*=)/,
      );
      // Reads a 64-bit LE granule position via two 32-bit halves (pure byte parse).
      expect(src).toMatch(/readUInt32LE/);
      // The 2s floor at 48kHz Opus.
      expect(src).toMatch(/96000/);
      // The fail message names granulepos + <2s.
      expect(src).toMatch(/granulepos[\s\S]{0,40}<2s|<2s[\s\S]{0,40}granulepos/i);
    });
  });

  describe('M-SMOKE-DELETE (INV-6) — non-empty session: deleted===false + GET 200', () => {
    it('asserts deleted===false for the guaranteed-non-empty session', () => {
      const src = readScript();
      expect(src).toMatch(/deleted\.json\.deleted\s*!==\s*false/);
    });

    it('performs a GET after the no-op DELETE expecting 200 (session survives)', () => {
      const src = readScript();
      // A GET on the same session id, after the DELETE, asserting status 200.
      expect(src).toMatch(/session survives GET 200|did not survive the no-op DELETE/);
    });

    it('no longer tolerates both delete booleans (the vacuous "validate shape not value" is gone)', () => {
      const src = readScript();
      // The pre-INC comment deliberately tolerated true and false. It must be gone.
      expect(src).not.toMatch(/Validate the response shape, not the boolean value/);
    });
  });
});
