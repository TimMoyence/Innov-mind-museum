import { mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  classifyRefs,
  LocalChatMediaPurger,
  noopMediaPurger,
  S3ChatMediaPurger,
} from '@modules/chat/jobs/chat-media-purger';
import { DEFAULT_LOCAL_AUDIOS_DIR } from '@modules/chat/adapters/secondary/audio-storage.stub';
import { DEFAULT_LOCAL_UPLOADS_DIR } from '@modules/chat/adapters/secondary/image-storage.stub';

import type { S3ImageStorageConfig } from '@modules/chat/adapters/secondary/s3-operations';

const FAKE_S3_CONFIG: S3ImageStorageConfig = {
  endpoint: 'https://s3.example.com',
  region: 'us-east-1',
  bucket: 'musaium-test',
  accessKeyId: 'AKIA-TEST',
  secretAccessKey: 'SECRET-TEST',
  signedUrlTtlSeconds: 900,
};

describe('classifyRefs', () => {
  it('buckets s3 image / s3 audio / local-image / local-audio / external refs', () => {
    const refs = [
      's3://chat-images/user-1/2026/04/abc.jpg',
      's3://chat-audios/2026/04/xyz.mp3',
      'local://abc.jpg',
      'local-audio://abc.mp3',
      'https://images.unsplash.com/foo.jpg',
      'https://www.wikidata.org/Q42.svg',
      'garbage',
      '',
    ];

    const result = classifyRefs(refs);

    expect(result.s3Keys).toEqual([
      'chat-images/user-1/2026/04/abc.jpg',
      'chat-audios/2026/04/xyz.mp3',
    ]);
    expect(result.localPaths.map((p) => p.ref)).toEqual([
      'local://abc.jpg',
      'local-audio://abc.mp3',
    ]);
    expect(result.external).toEqual([
      'https://images.unsplash.com/foo.jpg',
      'https://www.wikidata.org/Q42.svg',
      'garbage',
    ]);
  });

  it('drops empty strings', () => {
    const result = classifyRefs(['']);
    expect(result.s3Keys).toEqual([]);
    expect(result.localPaths).toEqual([]);
    expect(result.external).toEqual([]);
  });
});

describe('noopMediaPurger', () => {
  it('returns every input ref under skipped', async () => {
    const refs = ['s3://k1', 'local://x.jpg', 'https://external.com/a.png'];
    const result = await noopMediaPurger.deleteRefs(refs);
    expect(result.deleted).toEqual([]);
    expect(result.failed).toEqual([]);
    expect(result.skipped).toEqual(refs);
  });
});

describe('S3ChatMediaPurger', () => {
  it('batches DeleteObjects calls and reports per-key success', async () => {
    const batchDeleter = jest.fn().mockResolvedValue(undefined);
    const purger = new S3ChatMediaPurger(FAKE_S3_CONFIG, batchDeleter);

    const refs = ['s3://chat-images/foo.jpg', 's3://chat-audios/bar.mp3'];
    const result = await purger.deleteRefs(refs);

    expect(batchDeleter).toHaveBeenCalledTimes(1);
    expect(batchDeleter).toHaveBeenCalledWith(FAKE_S3_CONFIG, [
      'chat-images/foo.jpg',
      'chat-audios/bar.mp3',
    ]);
    expect(result.deleted).toEqual(['chat-images/foo.jpg', 'chat-audios/bar.mp3']);
    expect(result.failed).toEqual([]);
    expect(result.skipped).toEqual([]);
  });

  it('marks every key in a failed batch as failed (with reason) and keeps going', async () => {
    const batchDeleter = jest.fn().mockRejectedValue(new Error('S3 503 Slow Down'));
    const purger = new S3ChatMediaPurger(FAKE_S3_CONFIG, batchDeleter);

    const result = await purger.deleteRefs(['s3://chat-images/a.jpg', 's3://chat-audios/b.mp3']);

    expect(result.deleted).toEqual([]);
    expect(result.failed).toHaveLength(2);
    expect(result.failed[0].reason).toBe('S3 503 Slow Down');
    expect(result.failed.map((f) => f.ref).sort()).toEqual(
      ['s3://chat-audios/b.mp3', 's3://chat-images/a.jpg'].sort(),
    );
  });

  it('routes external URLs to skipped without calling S3', async () => {
    const batchDeleter = jest.fn();
    const purger = new S3ChatMediaPurger(FAKE_S3_CONFIG, batchDeleter);

    const result = await purger.deleteRefs(['https://images.unsplash.com/x.jpg']);

    expect(batchDeleter).not.toHaveBeenCalled();
    expect(result.deleted).toEqual([]);
    expect(result.failed).toEqual([]);
    expect(result.skipped).toEqual(['https://images.unsplash.com/x.jpg']);
  });

  it('handles empty refs without making S3 calls', async () => {
    const batchDeleter = jest.fn();
    const purger = new S3ChatMediaPurger(FAKE_S3_CONFIG, batchDeleter);

    const result = await purger.deleteRefs([]);

    expect(batchDeleter).not.toHaveBeenCalled();
    expect(result).toEqual({ deleted: [], failed: [], skipped: [] });
  });
});

describe('LocalChatMediaPurger', () => {
  // We need files to exist at the *default* local paths because the
  // resolveLocalImageFilePath / resolveLocalAudioFilePath helpers join the
  // ref filename onto those defaults. Seed two real files there, exercise
  // the purger, then confirm they're gone.
  let createdImage: string;
  let createdAudio: string;

  beforeAll(() => {
    const tmpToken = mkdtempSync(path.join(tmpdir(), 'chat-purge-'));
    void tmpToken;
    // Default uploads / audios dirs come from process.cwd() — write test
    // fixtures there. We use unique names so we don't collide with anything
    // an unrelated test might have left behind.
    const uniq = `purge-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const imageName = `${uniq}.png`;
    const audioName = `${uniq}.mp3`;

    // ensure dirs exist
    require('node:fs').mkdirSync(DEFAULT_LOCAL_UPLOADS_DIR, { recursive: true });
    require('node:fs').mkdirSync(DEFAULT_LOCAL_AUDIOS_DIR, { recursive: true });

    createdImage = path.join(DEFAULT_LOCAL_UPLOADS_DIR, imageName);
    createdAudio = path.join(DEFAULT_LOCAL_AUDIOS_DIR, audioName);
    writeFileSync(createdImage, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    writeFileSync(createdAudio, Buffer.from([0x49, 0x44, 0x33, 0x03]));

    // expose ref forms via closures
    (globalThis as Record<string, unknown>).__localImageRef =
      `local://${path.basename(createdImage)}`;
    (globalThis as Record<string, unknown>).__localAudioRef =
      `local-audio://${path.basename(createdAudio)}`;
  });

  it('unlinks local image + audio files and reports them deleted', async () => {
    const purger = new LocalChatMediaPurger();
    const refs = [
      (globalThis as Record<string, unknown>).__localImageRef as string,
      (globalThis as Record<string, unknown>).__localAudioRef as string,
    ];

    const result = await purger.deleteRefs(refs);

    expect(result.deleted).toEqual(refs);
    expect(result.failed).toEqual([]);
    expect(existsSync(createdImage)).toBe(false);
    expect(existsSync(createdAudio)).toBe(false);
  });

  it('treats ENOENT as success on second run (idempotent)', async () => {
    const purger = new LocalChatMediaPurger();
    const refs = [
      (globalThis as Record<string, unknown>).__localImageRef as string,
      (globalThis as Record<string, unknown>).__localAudioRef as string,
    ];

    const result = await purger.deleteRefs(refs);

    expect(result.deleted).toEqual(refs);
    expect(result.failed).toEqual([]);
  });

  it('routes s3:// refs to skipped (mixed-mode safety net)', async () => {
    const purger = new LocalChatMediaPurger();
    const result = await purger.deleteRefs([
      's3://chat-images/foo.jpg',
      'https://images.unsplash.com/x.jpg',
    ]);

    expect(result.deleted).toEqual([]);
    expect(result.failed).toEqual([]);
    expect(result.skipped.sort()).toEqual(
      ['s3://chat-images/foo.jpg', 'https://images.unsplash.com/x.jpg'].sort(),
    );
  });
});
