import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SMOKE_SCRIPT_PATH = resolve(__dirname, '../../../scripts/smoke-api.cjs');
const VALIDATE_AUDIO_PATH = resolve(__dirname, '../../../scripts/validate-audio.cjs');

const readScript = (): string => readFileSync(SMOKE_SCRIPT_PATH, 'utf8');
const readValidator = (): string => readFileSync(VALIDATE_AUDIO_PATH, 'utf8');

describe('smoke-api.cjs — R5 TTS contract (static grep)', () => {
  describe('R3 / D5 — POST /api/chat/messages/:messageId/tts is exercised', () => {
    it('source references the TTS endpoint path template', () => {
      const src = readScript();
      expect(src).toMatch(/\/api\/chat\/messages\/\$\{[A-Za-z0-9_]+\}\/tts/);
    });

    it('source declares a fetchBinary helper for binary responses (D5)', () => {
      const src = readScript();
      expect(src).toMatch(
        /(?:function\s+fetchBinary\s*\(|const\s+fetchBinary\s*=|async\s+function\s+fetchBinary\s*\()/,
      );
    });
  });

  describe('R1 — chat POST drives the assistant reply that R5 then synthesizes', () => {
    it('source posts to /api/chat/sessions/:id/messages with a fixed FR prompt', () => {
      const src = readScript();
      expect(src).toMatch(/\/api\/chat\/sessions\/\$\{[A-Za-z0-9_]+\}\/messages/);
      expect(src).toContain('Bonjour, parle-moi de la Joconde.');
    });
  });

  describe('AC9 — happy-path log line shape', () => {
    it('source emits a "tts OK" log token (currently absent at baseline)', () => {
      const src = readScript();
      expect(src).toMatch(/\[smoke:api\]\s+tts OK/);
    });

    it('source builds the log line in the exact AC9 format', () => {
      const src = readScript();
      expect(src).toMatch(/bytes=\$\{[^}]+\}/);
      expect(src).toMatch(/contentType=\$\{[^}]+\}/);
      expect(src).toMatch(/msgId=\$\{[^}]+\}/);
    });
  });

  describe('R10 / AC8 — cleanup runs unconditionally via try/finally', () => {
    it('a finally block appears AFTER the "tts OK" log token (anchors cleanup to TTS region)', () => {
      const src = readScript();
      const idxTts = src.indexOf('tts OK');
      expect(idxTts).toBeGreaterThan(-1);
      const tail = idxTts >= 0 ? src.slice(idxTts) : '';
      expect(tail).toMatch(/}\s*finally\s*{/);
    });
  });

  describe('R7 / N3 — fail-loud on 501 FEATURE_UNAVAILABLE', () => {
    it('source carries the exact failure message for unavailable TTS', () => {
      const src = readScript();
      expect(src).toMatch(/TTS unavailable \(501 FEATURE_UNAVAILABLE\)/);
    });
  });

  describe('R6 — empty assistant reply (204) surfaces as smoke failure', () => {
    it('source carries the 204 failure message', () => {
      const src = readScript();
      expect(src).toMatch(/TTS returned 204/);
    });
  });

  describe('R4 / D2 — MP3 magic-byte validation is performed inline', () => {
    it('source checks the ID3 prefix (0x49 0x44 0x33)', () => {
      const src = readValidator();
      const hasHex = /0x49\b[\s\S]{0,60}0x44\b[\s\S]{0,60}0x33\b/.test(src);
      const hasAscii = /['"`]ID3['"`]/.test(src);
      expect(hasHex || hasAscii).toBe(true);
    });

    it('source checks the MPEG frame-sync byte 0xFF', () => {
      const src = readScript();
      expect(src).toMatch(/0xff/i);
    });
  });

  describe('R5 — minimum byte-length floor (defence against truncation / error envelope)', () => {
    it('source requires the shared validate-audio.cjs module', () => {
      const src = readScript();
      expect(src).toMatch(/require\(\s*['"]\.\/validate-audio\.cjs['"]\s*\)/);
    });

    it('source gates the body length against the MIN_TTS_BYTE_LENGTH floor', () => {
      const src = readScript();
      expect(src).toMatch(
        /(?:length|byteLength)\s*[><=]+\s*MIN_TTS_BYTE_LENGTH|MIN_TTS_BYTE_LENGTH\s*[><=]+\s*(?:length|byteLength)/,
      );
    });

    it('validate-audio.cjs pins the literal floor to 1024', () => {
      const validator = readValidator();
      expect(validator).toMatch(/MIN_TTS_BYTE_LENGTH\s*=\s*1024/);
    });
  });

  describe('AC6 — TTS stage sequenced between compare and cleanup', () => {
    it('"tts OK" log appears between "compare OK" and "cleanup delete session OK" in source', () => {
      const src = readScript();
      const idxCompare = src.indexOf('compare OK');
      const idxTts = src.indexOf('tts OK');
      const idxCleanup = src.indexOf('cleanup delete session OK');
      expect(idxCompare).toBeGreaterThan(-1);
      expect(idxCleanup).toBeGreaterThan(-1);
      expect(idxTts).toBeGreaterThan(idxCompare);
      expect(idxTts).toBeLessThan(idxCleanup);
    });
  });

  describe('AC9 line-anchored — full single-line regex match', () => {
    it('source contains a console.log template that matches the AC9 contract regex shape', () => {
      const src = readScript();
      expect(src).toMatch(
        /console\.log\([^)]*\[smoke:api\][^)]*tts OK[^)]*bytes=\$\{[^)]*contentType=\$\{[^)]*msgId=\$\{[^)]*\)/,
      );
    });
  });
});

describe('validate-audio.cjs — extracted pure helpers (closes the former it.todo)', () => {
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
      { name: 'JSON error envelope', buf: Buffer.from([0x7b, 0x22, 0x65, 0x72]) },
      { name: 'HTML error page', buf: Buffer.from([0x3c, 0x21, 0x44, 0x4f]) },
      { name: 'OggS single-byte drift', buf: Buffer.from([0x4f, 0x67, 0x67, 0x54, 0x00]) },
      { name: 'too short (<4 bytes)', buf: Buffer.from([0x4f, 0x67, 0x67]) },
    ])('rejects $name as null (no known container)', ({ buf }) => {
      expect(validateAudio.detectAudioContainer(buf)).toBeNull();
    });
  });

  describe('readLastOggGranulePos — Ogg page granule parse (INV-5)', () => {
    it('reads the 64-bit LE granulepos from a single Ogg page header', () => {
      const page = Buffer.alloc(14);
      page.write('OggS', 0, 'ascii');
      page[4] = 0x00;
      page[5] = 0x02;
      page.writeUInt32LE(96000, 6);
      page.writeUInt32LE(0, 10);
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
      const stream = Buffer.concat([mkPage(0), mkPage(240000)]);
      expect(validateAudio.readLastOggGranulePos(stream)).toBe(240000);
    });

    it('recombines low+high halves above 2^32 without BigInt loss', () => {
      const page = Buffer.alloc(14);
      page.write('OggS', 0, 'ascii');
      page.writeUInt32LE(0, 6);
      page.writeUInt32LE(1, 10);
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

describe('smoke-api.cjs — INC-2026-06-14 fail-loud contract (static grep)', () => {
  describe('H1-COMPARE-DEFAULT-200 (INV-2) — a 503 compare fails by default', () => {
    it('defaults compare expected to [200] and gates 503 behind SMOKE_COMPARE_ALLOW_ENCODER_DOWN', () => {
      const src = readScript();
      expect(src).toMatch(/SMOKE_COMPARE_ALLOW_ENCODER_DOWN/);
      expect(src).toMatch(
        /getEnv\(\s*['"]SMOKE_COMPARE_ALLOW_ENCODER_DOWN['"]\s*,\s*['"]false['"]\s*\)/,
      );
      expect(src).toMatch(/allowEncoderDown\s*\?\s*\[\s*200\s*,\s*503\s*\]\s*:\s*\[\s*200\s*\]/);
    });
  });

  describe('H1-COMPARE-MODELVERSION-PINNED (INV-3) — 200 must carry the catalogued model version', () => {
    it('reads SMOKE_EXPECTED_MODEL_VERSION defaulting to the live SigLIP version and asserts equality', () => {
      const src = readScript();
      expect(src).toMatch(
        /getEnv\(\s*['"]SMOKE_EXPECTED_MODEL_VERSION['"]\s*,\s*['"]siglip2-base-patch16-224@v1['"]\s*,?\s*\)/,
      );
      expect(src).toMatch(/modelVersion\s*!==\s*expectedModelVersion/);
    });

    it('no longer accepts any non-empty modelVersion on a 200 (the old vacuous check is gone)', () => {
      const src = readScript();
      expect(src).not.toMatch(/Compare 200 response missing modelVersion/);
    });
  });

  describe('M-SMOKE-HEALTH-REQUIRE-OK (INV-1) — degraded health and redis-down fail by default', () => {
    it('requires status===ok by default and gates degraded behind SMOKE_ALLOW_DEGRADED_HEALTH', () => {
      const src = readScript();
      expect(src).toMatch(
        /getEnv\(\s*['"]SMOKE_ALLOW_DEGRADED_HEALTH['"]\s*,\s*['"]false['"]\s*\)/,
      );
      expect(src).toMatch(/\[\s*['"]ok['"]\s*,\s*['"]degraded['"]\s*\]\s*:\s*\[\s*['"]ok['"]\s*\]/);
      expect(src).not.toMatch(
        /status\s*!==\s*['"]ok['"]\s*&&\s*[A-Za-z0-9_.?]+\s*!==\s*['"]degraded['"]/,
      );
    });

    it('defaults SMOKE_REQUIRE_REDIS to true and distinguishes skipped from down', () => {
      const src = readScript();
      expect(src).toMatch(/getEnv\(\s*['"]SMOKE_REQUIRE_REDIS['"]\s*,\s*['"]true['"]\s*\)/);
      expect(src).toMatch(/===\s*['"]skipped['"]/);
      expect(src).toMatch(/===\s*['"]down['"]/);
    });
  });

  describe('M-SMOKE-CHAT (INV-4) — length>50 + round-trip GET, citations stay unasserted', () => {
    it('asserts the assistant text length is greater than 50 chars', () => {
      const src = readScript();
      expect(src).toMatch(/\.trim\(\)\.length\s*<=\s*50/);
    });

    it('performs a GET round-trip on the session and finds the persisted assistant message', () => {
      const src = readScript();
      expect(src).toMatch(/method:\s*['"]GET['"]/);
      expect(src).toMatch(
        /\.find\(\s*\(?[A-Za-z0-9_]+\)?\s*=>\s*[A-Za-z0-9_]+\??\.id\s*===\s*assistantMessageId\s*\)/,
      );
      expect(src).toMatch(/chat round-trip OK/);
    });

    it('does NOT assert citations are non-empty (citations is nullable on the healthy path)', () => {
      const src = readScript();
      expect(src).not.toMatch(
        /citations[\s\S]{0,80}(?:length\s*===\s*0|missing citations|empty citations)/i,
      );
    });
  });

  describe('M-SMOKE-TTS-GRANULEPOS (INV-5) — decoded audio duration, not just magic bytes', () => {
    it('validate-audio.cjs declares the Ogg granulepos parser and the >=96000-sample floor', () => {
      const validator = readValidator();
      expect(validator).toMatch(
        /(?:function\s+readLastOggGranulePos\s*\(|const\s+readLastOggGranulePos\s*=)/,
      );
      expect(validator).toMatch(/readUInt32LE/);
      expect(validator).toMatch(/MIN_GRANULEPOS_2S_48KHZ\s*=\s*96000/);
    });

    it('smoke source gates the parsed granulepos against the shared floor and fails loud (<2s)', () => {
      const src = readScript();
      expect(src).toMatch(/readLastOggGranulePos\s*\(/);
      expect(src).toMatch(/granulePos\s*<\s*MIN_GRANULEPOS_2S_48KHZ/);
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
      expect(src).toMatch(/session survives GET 200|did not survive the no-op DELETE/);
    });

    it('no longer tolerates both delete booleans (the vacuous "validate shape not value" is gone)', () => {
      const src = readScript();
      expect(src).not.toMatch(/Validate the response shape, not the boolean value/);
    });
  });
});
