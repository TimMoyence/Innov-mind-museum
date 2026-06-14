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
// The byte-floor + Ogg-granulepos validators were extracted out of the smoke
// script into this shared, dependency-free module (2026-06-14). The smoke
// `require()`s it, so the static contract for those two checks now reads the
// validator's text — see `readValidator` — instead of the smoke script's.
const VALIDATE_AUDIO_PATH = resolve(__dirname, '../../../scripts/validate-audio.cjs');

const readScript = (): string => readFileSync(SMOKE_SCRIPT_PATH, 'utf8');
const readValidator = (): string => readFileSync(VALIDATE_AUDIO_PATH, 'utf8');

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
    it('source requires the shared validate-audio.cjs module', () => {
      const src = readScript();
      // The floor logic now lives in the extracted validator; the smoke MUST
      // require it (otherwise the floor check would be silently dropped).
      expect(src).toMatch(/require\(\s*['"]\.\/validate-audio\.cjs['"]\s*\)/);
    });

    it('source gates the body length against the MIN_TTS_BYTE_LENGTH floor', () => {
      const src = readScript();
      // §1 R5 — the smoke compares the buffer length against the shared floor
      // constant (don't bind to the exact comparator direction).
      expect(src).toMatch(
        /(?:length|byteLength)\s*[><=]+\s*MIN_TTS_BYTE_LENGTH|MIN_TTS_BYTE_LENGTH\s*[><=]+\s*(?:length|byteLength)/,
      );
    });

    it('validate-audio.cjs pins the literal floor to 1024', () => {
      const validator = readValidator();
      // §1 R5 — the literal 1024 floor lives in the shared module now.
      expect(validator).toMatch(/MIN_TTS_BYTE_LENGTH\s*=\s*1024/);
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

  // 2026-06-14: the magic-byte validator HAS now been extracted into the
  // sibling `scripts/validate-audio.cjs` (shared by the smoke + tests), so the
  // former `it.todo('validateMp3MagicBytes ...')` placeholder is replaced by the
  // real pure-helper behavioural tests below — see the dedicated describe block
  // `validate-audio.cjs — extracted pure helpers`.
});

/**
 * Pure-helper behavioural tests for the extracted `scripts/validate-audio.cjs`.
 *
 * This closes the long-standing `it.todo` in the static-grep block above. The
 * smoke (`scripts/smoke-api.cjs`) `require()`s this exact module, so these
 * assertions exercise the SAME code that runs post-deploy — they are not a
 * re-implementation. We assert OUTCOMES (which container a byte buffer maps to,
 * what granulepos a crafted Ogg page yields), never the source shape.
 */
describe('validate-audio.cjs — extracted pure helpers (closes the former it.todo)', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- pure CJS validator shared with the .cjs smoke script; required to run the identical implementation, not a typed re-export
  const validateAudio = require('../../../scripts/validate-audio.cjs') as {
    MIN_GRANULEPOS_2S_48KHZ: number;
    MIN_TTS_BYTE_LENGTH: number;
    detectAudioContainer: (buf: Buffer) => 'ogg' | 'mp3-id3' | 'mp3-frame-sync' | null;
    readLastOggGranulePos: (buf: Buffer) => number | null;
  };

  describe('detectAudioContainer — magic-byte classification (R4 / D2)', () => {
    it('classifies an "OggS" header as ogg', () => {
      const ogg = Buffer.from([0x4f, 0x67, 0x67, 0x53, 0x00, 0x02]);
      expect(validateAudio.detectAudioContainer(ogg)).toBe('ogg');
    });

    it('classifies an "ID3" header as mp3-id3', () => {
      const id3 = Buffer.from([0x49, 0x44, 0x33, 0x03, 0x00]);
      expect(validateAudio.detectAudioContainer(id3)).toBe('mp3-id3');
    });

    it('classifies an MPEG frame-sync (0xFF 0xFB) as mp3-frame-sync', () => {
      const mp3 = Buffer.from([0xff, 0xfb, 0x90, 0x44]);
      expect(validateAudio.detectAudioContainer(mp3)).toBe('mp3-frame-sync');
    });

    it.each([
      { name: 'all zeros', buf: Buffer.from([0x00, 0x00, 0x00, 0x00]) },
      { name: 'JSON error envelope', buf: Buffer.from([0x7b, 0x22, 0x65, 0x72]) /* {"er */ },
      { name: 'HTML error page', buf: Buffer.from([0x3c, 0x21, 0x44, 0x4f]) /* <!DO */ },
      { name: 'OggS single-byte drift', buf: Buffer.from([0x4f, 0x67, 0x67, 0x54, 0x00]) },
      { name: 'too short (<4 bytes)', buf: Buffer.from([0x4f, 0x67, 0x67]) },
    ])('rejects $name as null (no known container)', ({ buf }) => {
      expect(validateAudio.detectAudioContainer(buf)).toBeNull();
    });
  });

  describe('readLastOggGranulePos — Ogg page granule parse (INV-5)', () => {
    it('reads the 64-bit LE granulepos from a single Ogg page header', () => {
      // Craft a minimal Ogg page header: "OggS" + version + type + 8-byte
      // granulepos. We encode 96000 (the 2s @48kHz floor) as a 64-bit LE value.
      const page = Buffer.alloc(14);
      page.write('OggS', 0, 'ascii'); // bytes 0..3
      page[4] = 0x00; // version
      page[5] = 0x02; // header type
      page.writeUInt32LE(96000, 6); // low 32 bits of granulepos
      page.writeUInt32LE(0, 10); // high 32 bits
      expect(validateAudio.readLastOggGranulePos(page)).toBe(96000);
    });

    it('reads the LAST page when several "OggS" pages are concatenated', () => {
      const mkPage = (granule: number): Buffer => {
        const p = Buffer.alloc(14);
        p.write('OggS', 0, 'ascii');
        p.writeUInt32LE(granule, 6);
        p.writeUInt32LE(0, 10);
        return p;
      };
      // A stream whose final page carries the cumulative sample count.
      const stream = Buffer.concat([mkPage(0), mkPage(240000)]);
      expect(validateAudio.readLastOggGranulePos(stream)).toBe(240000);
    });

    it('recombines low+high halves above 2^32 without BigInt loss', () => {
      const page = Buffer.alloc(14);
      page.write('OggS', 0, 'ascii');
      page.writeUInt32LE(0, 6); // low
      page.writeUInt32LE(1, 10); // high = 1 → value = 2^32
      expect(validateAudio.readLastOggGranulePos(page)).toBe(0x1_0000_0000);
    });

    it('returns null when no "OggS" page header is present', () => {
      const notOgg = Buffer.from([
        0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      ]);
      expect(validateAudio.readLastOggGranulePos(notOgg)).toBeNull();
    });
  });

  describe('exported floors are the catalogued constants', () => {
    it('MIN_GRANULEPOS_2S_48KHZ is 96000 (2s × 48000 Hz Opus)', () => {
      expect(validateAudio.MIN_GRANULEPOS_2S_48KHZ).toBe(96000);
    });

    it('MIN_TTS_BYTE_LENGTH is 1024 (R5 floor)', () => {
      expect(validateAudio.MIN_TTS_BYTE_LENGTH).toBe(1024);
    });
  });
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
    it('validate-audio.cjs declares the Ogg granulepos parser and the >=96000-sample floor', () => {
      const validator = readValidator();
      // The parser + 2s floor constant live in the extracted shared module.
      expect(validator).toMatch(
        /(?:function\s+readLastOggGranulePos\s*\(|const\s+readLastOggGranulePos\s*=)/,
      );
      // Reads a 64-bit LE granule position via two 32-bit halves (pure byte parse).
      expect(validator).toMatch(/readUInt32LE/);
      // The 2s floor at 48kHz Opus, pinned as a named constant.
      expect(validator).toMatch(/MIN_GRANULEPOS_2S_48KHZ\s*=\s*96000/);
    });

    it('smoke source gates the parsed granulepos against the shared floor and fails loud (<2s)', () => {
      const src = readScript();
      // The smoke MUST call the shared parser and compare against the shared
      // floor constant — otherwise a silence/stub Opus body would pass.
      expect(src).toMatch(/readLastOggGranulePos\s*\(/);
      expect(src).toMatch(/granulePos\s*<\s*MIN_GRANULEPOS_2S_48KHZ/);
      // The fail message (emitted by the smoke at runtime) names granulepos + <2s.
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
