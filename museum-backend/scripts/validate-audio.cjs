'use strict';

/**
 * Pure, dependency-free audio byte validators shared by the post-deploy smoke
 * (`scripts/smoke-api.cjs`) and its unit tests
 * (`tests/unit/audio/tts-audio-magic-bytes.spec.ts`,
 * `tests/unit/scripts/smoke-api-tts-contract.test.ts`).
 *
 * Extracted 2026-06-14 (closes the long-standing `it.todo` in the smoke TTS
 * contract test). Before this, the magic-byte detector existed as TWO
 * byte-identical inline copies — once in `smoke-api.cjs` step 4 and once
 * re-implemented in `tts-audio-magic-bytes.spec.ts` (`detectAudioContainer`),
 * which itself documented the duplication as "kept intentionally byte-identical".
 * The Ogg granulepos parser (INV-5) was a third inline-only helper. Centralising
 * them here means a single source of truth: a change to the signature constants
 * fails the unit test pre-merge AND changes the smoke behaviour at once.
 *
 * No ffprobe / ffmpeg, no new npm deps — every check is a raw byte inspection.
 */

/**
 * The minimum decoded-sample floor (Opus @48 kHz) the smoke requires before it
 * trusts an Ogg/Opus TTS body as "real audio". 2s × 48000 Hz = 96000 samples;
 * Opus pre-skip only ADDS to this floor, so a silence/empty stub (granulepos ~0)
 * fails loudly. Exported so the smoke and tests share the exact constant.
 */
const MIN_GRANULEPOS_2S_48KHZ = 96000;

/**
 * The smoke's TTS body length floor (R5). A sub-1KB binary body is almost
 * always an error envelope misrouted as binary, or a truncated stream.
 */
const MIN_TTS_BYTE_LENGTH = 1024;

/**
 * Classify an audio buffer by its container magic bytes. Mirrors the formats
 * the backend has shipped for TTS:
 *   - Ogg  ("OggS" = 0x4f 0x67 0x67 0x53) — OpenAI Opus (response_format:'opus'
 *           since C9.12a 2026-05-17, `text-to-speech.openai.ts`).
 *   - MP3 with ID3v2 tag ("ID3" = 0x49 0x44 0x33) — legacy MP3 fallback path.
 *   - Bare MP3 frame-sync (0xFF followed by 0xF*, i.e. (b1 & 0xE0) === 0xE0).
 *
 * @param {Buffer | Uint8Array} buf
 * @returns {'ogg' | 'mp3-id3' | 'mp3-frame-sync' | null} the detected container,
 *          or `null` if the buffer is too short or matches no known signature.
 */
function detectAudioContainer(buf) {
  if (!buf || buf.length < 4) return null;
  if (buf[0] === 0x4f && buf[1] === 0x67 && buf[2] === 0x67 && buf[3] === 0x53) return 'ogg';
  if (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) return 'mp3-id3';
  if (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return 'mp3-frame-sync';
  return null;
}

/**
 * M-SMOKE-TTS-GRANULEPOS (INV-5) — read the granule position of the LAST Ogg
 * page from an Ogg/Opus byte stream, purely from bytes (no ffprobe/ffmpeg, no
 * new deps). Ogg page header layout (RFC 3533 §6):
 *   bytes 0..3  : "OggS" capture pattern (0x4f 0x67 0x67 0x53)
 *   byte  4     : stream structure version
 *   byte  5     : header type flag
 *   bytes 6..13 : granule position (64-bit little-endian)
 * For Opus, the granule position is the total number of decoded PCM samples at
 * 48 kHz at the end of that page (RFC 7845 §4) minus pre-skip — so the last
 * page's granulepos is a lower bound on the decoded sample count.
 *
 * @param {Buffer} buf
 * @returns {number | null} the granulepos as a Number (audio is < 2^53 samples
 *          here, ~5.7 years of audio, so no BigInt precision concern), or `null`
 *          if no Ogg page header is found.
 */
function readLastOggGranulePos(buf) {
  // Scan for the LAST "OggS" capture pattern (0x4f 0x67 0x67 0x53).
  let lastPageStart = -1;
  for (let i = 0; i + 14 <= buf.length; i += 1) {
    if (buf[i] === 0x4f && buf[i + 1] === 0x67 && buf[i + 2] === 0x67 && buf[i + 3] === 0x53) {
      lastPageStart = i;
    }
  }
  if (lastPageStart === -1) {
    return null;
  }
  // 64-bit little-endian granule position at offset +6 of the page header.
  // Read as two 32-bit halves to avoid BigInt; recombine in Number space.
  const low = buf.readUInt32LE(lastPageStart + 6);
  const high = buf.readUInt32LE(lastPageStart + 10);
  return high * 0x1_0000_0000 + low;
}

module.exports = {
  MIN_GRANULEPOS_2S_48KHZ,
  MIN_TTS_BYTE_LENGTH,
  detectAudioContainer,
  readLastOggGranulePos,
};
