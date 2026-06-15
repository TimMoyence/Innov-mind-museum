/**
 * RED — Documentation + structural lock for the deploy-prod smoke crash
 * `[smoke:api] FAIL: TTS audio magic bytes invalid (head=0x4f 0x67 0x67 0x53, ...)`
 *
 * Root cause (`team-state/2026-05-22-smoke-tts-magic-bytes-ogg-vs-mp3/spec.md`) :
 * `text-to-speech.openai.ts:46` calls OpenAI TTS with `response_format: 'opus'`
 * (intentional since C9.12a — -40% bandwidth + -50-100ms first-byte vs MP3).
 * Opus audio is delivered inside an Ogg container, whose magic bytes are the
 * ASCII string "OggS" (0x4f 0x67 0x67 0x53). The post-deploy smoke was still
 * validating only MP3 magic bytes (ID3v2 header or MPEG frame-sync) and
 * rejected every healthy Opus response as "invalid magic bytes".
 *
 * Fix : `scripts/smoke-api.cjs` now accepts Ogg in addition to MP3.
 *
 * This spec locks the magic-byte SIGNATURES smoke depends on. If the OpenAI
 * TTS contract ever changes (e.g. switch back to MP3, or move to FLAC), the
 * smoke will catch it post-deploy — but this unit test catches accidental
 * regressions in the signature constants pre-merge.
 *
 * 2026-06-14: the detector is no longer an inline replica. The smoke
 * (`scripts/smoke-api.cjs`) and this test now import the SAME function from the
 * extracted, dependency-free `scripts/validate-audio.cjs`, so the contract is
 * locked by sharing the real implementation rather than by replication.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports -- shared pure CJS validator consumed by the .cjs smoke script; required here to lock the identical implementation
const { detectAudioContainer } = require('../../../scripts/validate-audio.cjs') as {
  detectAudioContainer: (buf: Buffer) => 'ogg' | 'mp3-id3' | 'mp3-frame-sync' | null;
};

describe('TTS audio magic-byte signatures — structural lock for smoke validator', () => {
  describe('Ogg container (OpenAI Opus output since C9.12a 2026-05-17)', () => {
    it('recognizes "OggS" header (0x4f 0x67 0x67 0x53)', () => {
      // First 4 bytes of any well-formed Ogg page (per RFC 3533 §6).
      const oggHeader = Buffer.from([0x4f, 0x67, 0x67, 0x53, 0x00, 0x02 /* version + type */]);
      expect(detectAudioContainer(oggHeader)).toBe('ogg');
    });

    it('rejects "OggS" prefix with wrong byte (single-byte drift)', () => {
      // Defensive : a one-byte flip in the magic should NOT pass as ogg.
      const corrupted = Buffer.from([0x4f, 0x67, 0x67, 0x54 /* T instead of S */, 0x00]);
      expect(detectAudioContainer(corrupted)).toBeNull();
    });
  });

  describe('MP3 with ID3v2 tag (legacy MP3 path, kept for fallback)', () => {
    it('recognizes "ID3" header (0x49 0x44 0x33)', () => {
      // ID3v2.x tag header per id3.org spec (10 bytes total, first 3 = "ID3").
      const id3Header = Buffer.from([0x49, 0x44, 0x33, 0x03, 0x00 /* version + flags */]);
      expect(detectAudioContainer(id3Header)).toBe('mp3-id3');
    });
  });

  describe('Bare MP3 frame-sync', () => {
    it('recognizes 0xFF + 0xF? (MPEG-1 Layer III frame, common)', () => {
      // Frame sync is 11 ones (binary 11111111 111x_xxxx). 0xFF 0xFB = MPEG-1 LIII no-CRC.
      const mpeg1L3 = Buffer.from([0xff, 0xfb, 0x90, 0x44]);
      expect(detectAudioContainer(mpeg1L3)).toBe('mp3-frame-sync');
    });

    it('recognizes 0xFF + 0xE? boundary (any (b1 & 0xE0) === 0xE0)', () => {
      // MPEG-2.5 sync = 0xFF 0xE3. The check is (b1 & 0xE0) === 0xE0 which
      // also matches 0xE0..0xEF and 0xF0..0xFF (since 0xE0 == 11100000 mask).
      const mpeg25 = Buffer.from([0xff, 0xe3, 0x00, 0x00]);
      expect(detectAudioContainer(mpeg25)).toBe('mp3-frame-sync');
    });
  });

  describe('rejection cases — neither Ogg nor MP3', () => {
    it.each([
      { name: 'all zeros', buf: Buffer.from([0x00, 0x00, 0x00, 0x00]) },
      {
        name: 'JSON error envelope start',
        buf: Buffer.from([0x7b, 0x22, 0x65, 0x72]) /* `{"er` */,
      },
      { name: 'HTML error page start', buf: Buffer.from([0x3c, 0x21, 0x44, 0x4f]) /* `<!DO` */ },
      { name: 'random binary garbage', buf: Buffer.from([0xde, 0xad, 0xbe, 0xef]) },
    ])('rejects $name as unknown container', ({ buf }) => {
      expect(detectAudioContainer(buf)).toBeNull();
    });

    it('rejects buffers shorter than 4 bytes (insufficient for any magic)', () => {
      expect(detectAudioContainer(Buffer.from([0x4f, 0x67, 0x67]))).toBeNull();
    });
  });
});
