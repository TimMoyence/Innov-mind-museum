/**
 * Phase 8 — pin the contracts of the local-filesystem audio storage stub.
 *
 * Used in dev + tests; a regression here makes TTS replay silently break
 * locally without surfacing in CI (S3 path differs). Each test pins one
 * specific named contract from JSDoc.
 */

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  DEFAULT_LOCAL_AUDIOS_DIR,
  LocalAudioStorage,
  resolveLocalAudioFilePath,
} from '@src/modules/chat/adapters/secondary/storage/audio-storage.stub';

describe('resolveLocalAudioFilePath', () => {
  it('returns absolute path under audiosDir for a valid ref', () => {
    expect(resolveLocalAudioFilePath('local-audio://abc.mp3', '/var/tmp/audios')).toBe(
      path.join('/var/tmp/audios', 'abc.mp3'),
    );
  });

  it('returns null for a ref missing the local-audio:// scheme', () => {
    expect(resolveLocalAudioFilePath('https://cdn.example/abc.mp3')).toBeNull();
  });

  it('returns null when the filename contains path-traversal chars', () => {
    // The regex restricts to [a-zA-Z0-9._-] — `..` and `/` are rejected so a
    // crafted ref can't escape the audios dir.
    expect(resolveLocalAudioFilePath('local-audio://../etc/passwd')).toBeNull();
    expect(resolveLocalAudioFilePath('local-audio://a/b.mp3')).toBeNull();
  });

  it('defaults audiosDir to DEFAULT_LOCAL_AUDIOS_DIR when omitted', () => {
    expect(resolveLocalAudioFilePath('local-audio://abc.mp3')).toBe(
      path.join(DEFAULT_LOCAL_AUDIOS_DIR, 'abc.mp3'),
    );
  });
});

describe('LocalAudioStorage', () => {
  let dir: string;
  let storage: LocalAudioStorage;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'phase8-audio-'));
    storage = new LocalAudioStorage(dir);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('save() writes the buffer + returns a local-audio:// reference using objectKey', async () => {
    const ref = await storage.save({
      buffer: Buffer.from('hello'),
      contentType: 'audio/mpeg',
      objectKey: 'sample.mp3',
    });

    expect(ref).toBe('local-audio://sample.mp3');
    const written = await readFile(path.join(dir, 'sample.mp3'));
    expect(written.toString()).toBe('hello');
  });

  it('save() generates a UUID-based filename when objectKey is empty (extension fallback to mp3)', async () => {
    const ref = await storage.save({
      buffer: Buffer.from('audio'),
      // Unknown content type → falls back to .mp3 per extensionByContentType.
      contentType: 'audio/unknown',
      objectKey: '',
    });

    expect(ref).toMatch(/^local-audio:\/\/[0-9a-f-]+\.mp3$/);
  });

  it('save() picks extension by content type (audio/wav → .wav)', async () => {
    const ref = await storage.save({
      buffer: Buffer.from('a'),
      contentType: 'audio/wav',
      objectKey: '',
    });

    expect(ref).toMatch(/\.wav$/);
  });

  it('getSignedReadUrl() returns file:// URL with future expiry when file exists', async () => {
    await writeFile(path.join(dir, 'present.mp3'), 'data');

    const result = await storage.getSignedReadUrl('local-audio://present.mp3');

    expect(result).not.toBeNull();
    expect(result!.url).toBe(`file://${path.join(dir, 'present.mp3')}`);
    expect(new Date(result!.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('getSignedReadUrl() returns null for invalid scheme (no traversal escape)', async () => {
    expect(await storage.getSignedReadUrl('https://nope')).toBeNull();
  });

  it('getSignedReadUrl() returns null when file does not exist', async () => {
    expect(await storage.getSignedReadUrl('local-audio://missing.mp3')).toBeNull();
  });

  it('deleteByRef() removes an existing file', async () => {
    await writeFile(path.join(dir, 'gone.mp3'), 'x');

    await storage.deleteByRef('local-audio://gone.mp3');

    await expect(readFile(path.join(dir, 'gone.mp3'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('deleteByRef() is a no-op for invalid scheme (no throw)', async () => {
    await expect(storage.deleteByRef('not-a-local-audio')).resolves.toBeUndefined();
  });

  it('deleteByRef() is best-effort: missing file does not throw', async () => {
    await expect(storage.deleteByRef('local-audio://never-existed.mp3')).resolves.toBeUndefined();
  });
});
