'use strict';

const MIN_GRANULEPOS_2S_48KHZ = 96000;

const MIN_TTS_BYTE_LENGTH = 1024;

function detectAudioContainer(buf) {
  if (!buf || buf.length < 4) return null;
  if (buf[0] === 0x4f && buf[1] === 0x67 && buf[2] === 0x67 && buf[3] === 0x53) return 'ogg';
  if (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) return 'mp3-id3';
  if (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return 'mp3-frame-sync';
  return null;
}

function readLastOggGranulePos(buf) {
  let lastPageStart = -1;
  for (let i = 0; i + 14 <= buf.length; i += 1) {
    if (buf[i] === 0x4f && buf[i + 1] === 0x67 && buf[i + 2] === 0x67 && buf[i + 3] === 0x53) {
      lastPageStart = i;
    }
  }
  if (lastPageStart === -1) {
    return null;
  }
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
