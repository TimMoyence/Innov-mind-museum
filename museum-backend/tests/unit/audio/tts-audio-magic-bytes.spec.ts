const { detectAudioContainer } = require('../../../scripts/validate-audio.cjs') as {
  detectAudioContainer: (buf: Buffer) => 'ogg' | 'mp3-id3' | 'mp3-frame-sync' | null;
};

describe('TTS audio magic-byte signatures — structural lock for smoke validator', () => {
  describe('Ogg container (OpenAI Opus output since C9.12a 2026-05-17)', () => {
    it('recognizes "OggS" header (0x4f 0x67 0x67 0x53)', () => {
      const oggHeader = Buffer.from([0x4f, 0x67, 0x67, 0x53, 0x00, 0x02]);
      expect(detectAudioContainer(oggHeader)).toBe('ogg');
    });

    it('rejects "OggS" prefix with wrong byte (single-byte drift)', () => {
      const corrupted = Buffer.from([0x4f, 0x67, 0x67, 0x54, 0x00]);
      expect(detectAudioContainer(corrupted)).toBeNull();
    });
  });

  describe('MP3 with ID3v2 tag (legacy MP3 path, kept for fallback)', () => {
    it('recognizes "ID3" header (0x49 0x44 0x33)', () => {
      const id3Header = Buffer.from([0x49, 0x44, 0x33, 0x03, 0x00]);
      expect(detectAudioContainer(id3Header)).toBe('mp3-id3');
    });
  });

  describe('Bare MP3 frame-sync', () => {
    it('recognizes 0xFF + 0xF? (MPEG-1 Layer III frame, common)', () => {
      const mpeg1L3 = Buffer.from([0xff, 0xfb, 0x90, 0x44]);
      expect(detectAudioContainer(mpeg1L3)).toBe('mp3-frame-sync');
    });

    it('recognizes 0xFF + 0xE? boundary (any (b1 & 0xE0) === 0xE0)', () => {
      const mpeg25 = Buffer.from([0xff, 0xe3, 0x00, 0x00]);
      expect(detectAudioContainer(mpeg25)).toBe('mp3-frame-sync');
    });
  });

  describe('rejection cases — neither Ogg nor MP3', () => {
    it.each([
      { name: 'all zeros', buf: Buffer.from([0x00, 0x00, 0x00, 0x00]) },
      {
        name: 'JSON error envelope start',
        buf: Buffer.from([0x7b, 0x22, 0x65, 0x72]),
      },
      { name: 'HTML error page start', buf: Buffer.from([0x3c, 0x21, 0x44, 0x4f]) },
      { name: 'random binary garbage', buf: Buffer.from([0xde, 0xad, 0xbe, 0xef]) },
    ])('rejects $name as unknown container', ({ buf }) => {
      expect(detectAudioContainer(buf)).toBeNull();
    });

    it('rejects buffers shorter than 4 bytes (insufficient for any magic)', () => {
      expect(detectAudioContainer(Buffer.from([0x4f, 0x67, 0x67]))).toBeNull();
    });
  });
});
