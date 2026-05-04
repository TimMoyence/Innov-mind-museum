/**
 * Phase 8 — pin the pure helpers exported from audio-storage.s3.ts.
 *
 * The S3 storage class itself requires AWS signing infra (covered by the
 * integration suite); the two pure functions below are the boundary between
 * the storage layer and the rest of the chat pipeline. A regression here
 * silently breaks ChatMessage.audioUrl resolution.
 */

import {
  buildS3AudioRef,
  parseS3AudioRef,
} from '@src/modules/chat/adapters/secondary/storage/audio-storage.s3';

describe('parseS3AudioRef', () => {
  it('returns { key } for a well-formed s3:// reference', () => {
    expect(parseS3AudioRef('s3://chat-audios/2026/05/abc.mp3')).toEqual({
      key: 'chat-audios/2026/05/abc.mp3',
    });
  });

  it('returns null for refs missing the s3:// scheme', () => {
    expect(parseS3AudioRef('https://cdn.example/abc.mp3')).toBeNull();
    expect(parseS3AudioRef('local-audio://abc.mp3')).toBeNull();
  });

  it('returns null for s3:// with empty key', () => {
    expect(parseS3AudioRef('s3://')).toBeNull();
  });
});

describe('buildS3AudioRef', () => {
  it('prefixes a bare key with s3://', () => {
    expect(buildS3AudioRef('chat-audios/2026/05/abc.mp3')).toBe('s3://chat-audios/2026/05/abc.mp3');
  });

  it('round-trips with parseS3AudioRef', () => {
    const ref = buildS3AudioRef('chat-audios/x.mp3');
    expect(parseS3AudioRef(ref)).toEqual({ key: 'chat-audios/x.mp3' });
  });
});
