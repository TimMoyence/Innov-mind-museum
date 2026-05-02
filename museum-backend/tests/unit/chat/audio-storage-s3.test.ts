/**
 * Phase 9 Sprint 9.4 Group I — pin the S3CompatibleAudioStorage adapter.
 *
 * The pure helpers (parseS3AudioRef + buildS3AudioRef) are covered by
 * audio-storage-s3-pure.test.ts. This file exercises the class methods
 * (save / getSignedReadUrl / deleteByRef) with the HTTP layer + signing
 * helpers fully mocked, lifting the file from 43% → 100% line coverage.
 */

const mockRandomUUID = jest.fn<string, []>();

jest.mock('node:crypto', () => {
  const actual = jest.requireActual<typeof import('node:crypto')>('node:crypto');
  return {
    ...actual,
    randomUUID: (...args: unknown[]) => mockRandomUUID(...(args as [])),
  };
});

jest.mock('@shared/observability/sentry', () => ({
  startSpan: jest.fn(
    async (_ctx: unknown, cb: (span: unknown) => Promise<unknown>) => await cb({}),
  ),
}));

jest.mock('@modules/chat/adapters/secondary/s3-operations', () => ({
  buildS3SignedHeadersForPut: jest.fn(),
  buildS3PresignedReadUrl: jest.fn(),
  deleteObjectsBatch: jest.fn(),
  httpPut: jest.fn(),
}));

jest.mock('@modules/chat/adapters/secondary/s3-path-utils', () => ({
  normalizeObjectKey: jest.fn(),
}));

import { S3CompatibleAudioStorage } from '@modules/chat/adapters/secondary/audio-storage.s3';
import {
  buildS3PresignedReadUrl,
  buildS3SignedHeadersForPut,
  deleteObjectsBatch,
  httpPut,
} from '@modules/chat/adapters/secondary/s3-operations';
import { normalizeObjectKey } from '@modules/chat/adapters/secondary/s3-path-utils';

import { makeS3Config } from '../../helpers/chat/s3-config.fixtures';

const buildPutMock = buildS3SignedHeadersForPut as jest.MockedFunction<
  typeof buildS3SignedHeadersForPut
>;
const buildReadUrlMock = buildS3PresignedReadUrl as jest.MockedFunction<
  typeof buildS3PresignedReadUrl
>;
const deleteBatchMock = deleteObjectsBatch as jest.MockedFunction<typeof deleteObjectsBatch>;
const httpPutMock = httpPut as jest.MockedFunction<typeof httpPut>;
const normalizeKeyMock = normalizeObjectKey as jest.MockedFunction<typeof normalizeObjectKey>;

const SIGNED_URL = new URL('https://s3.example.com/musaium-test/whatever.mp3');
const SIGNED_HEADERS = { Authorization: 'AWS4-HMAC-SHA256 sig=stub' };

describe('S3CompatibleAudioStorage', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // The default identity behaviour mirrors normalizeObjectKey for happy paths
    // (no prefix configured) — tests overriding the prefix can re-spy.
    normalizeKeyMock.mockImplementation(({ key, objectKeyPrefix }) =>
      objectKeyPrefix ? `${objectKeyPrefix}/${key}` : key,
    );
    buildPutMock.mockReturnValue({ url: SIGNED_URL, headers: SIGNED_HEADERS });
    httpPutMock.mockResolvedValue(undefined);
    buildReadUrlMock.mockReturnValue({
      url: 'https://signed.example/key.mp3?sig=abc',
      expiresAt: '2026-05-02T12:00:00.000Z',
    });
    deleteBatchMock.mockResolvedValue(undefined);
  });

  describe('save()', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-05-15T10:30:00.000Z'));
      mockRandomUUID.mockReturnValue('11111111-2222-3333-4444-555555555555');
    });

    afterEach(() => {
      jest.useRealTimers();
      mockRandomUUID.mockReset();
    });

    it('builds a fallback key with AUDIO_PREFIX/YYYY/MM/uuid.<ext> when objectKey is empty', async () => {
      const config = makeS3Config();
      const storage = new S3CompatibleAudioStorage(config);
      const buffer = Buffer.from('audio-bytes');

      const ref = await storage.save({
        buffer,
        contentType: 'audio/mpeg',
        objectKey: '',
      });

      expect(normalizeKeyMock).toHaveBeenCalledTimes(1);
      expect(normalizeKeyMock).toHaveBeenCalledWith({
        key: 'chat-audios/2026/05/11111111-2222-3333-4444-555555555555.mp3',
        objectKeyPrefix: undefined,
      });
      expect(ref).toBe('s3://chat-audios/2026/05/11111111-2222-3333-4444-555555555555.mp3');
    });

    it('honours an explicit objectKey when provided (skips fallback)', async () => {
      const storage = new S3CompatibleAudioStorage(makeS3Config());
      const buffer = Buffer.from('hello');

      const ref = await storage.save({
        buffer,
        contentType: 'audio/mpeg',
        objectKey: 'custom/path/file.mp3',
      });

      expect(normalizeKeyMock).toHaveBeenCalledWith({
        key: 'custom/path/file.mp3',
        objectKeyPrefix: undefined,
      });
      expect(ref).toBe('s3://custom/path/file.mp3');
    });

    it('forwards the configured objectKeyPrefix to normalizeObjectKey', async () => {
      const storage = new S3CompatibleAudioStorage(makeS3Config({ objectKeyPrefix: 'tenant-7' }));

      await storage.save({
        buffer: Buffer.from('x'),
        contentType: 'audio/mpeg',
        objectKey: 'a.mp3',
      });

      expect(normalizeKeyMock).toHaveBeenCalledWith({
        key: 'a.mp3',
        objectKeyPrefix: 'tenant-7',
      });
    });

    it.each([
      ['audio/mpeg', 'mp3'],
      ['audio/mp3', 'mp3'],
      ['audio/wav', 'wav'],
      ['audio/ogg', 'ogg'],
      ['audio/webm', 'webm'],
    ])('picks extension %s → .%s for the fallback key', async (contentType, ext) => {
      const storage = new S3CompatibleAudioStorage(makeS3Config());

      await storage.save({
        buffer: Buffer.from('a'),
        contentType,
        objectKey: '',
      });

      expect(normalizeKeyMock).toHaveBeenCalledWith({
        key: `chat-audios/2026/05/11111111-2222-3333-4444-555555555555.${ext}`,
        objectKeyPrefix: undefined,
      });
    });

    it('falls back to .mp3 for unknown content types', async () => {
      const storage = new S3CompatibleAudioStorage(makeS3Config());

      await storage.save({
        buffer: Buffer.from('a'),
        contentType: 'audio/flac',
        objectKey: '',
      });

      expect(normalizeKeyMock).toHaveBeenCalledWith({
        key: 'chat-audios/2026/05/11111111-2222-3333-4444-555555555555.mp3',
        objectKeyPrefix: undefined,
      });
    });

    it('calls buildS3SignedHeadersForPut with the config, normalized key, body, contentType, and now', async () => {
      const config = makeS3Config();
      const storage = new S3CompatibleAudioStorage(config);
      const buffer = Buffer.from('payload');

      await storage.save({
        buffer,
        contentType: 'audio/wav',
        objectKey: 'voice.wav',
      });

      expect(buildPutMock).toHaveBeenCalledTimes(1);
      const args = buildPutMock.mock.calls[0][0];
      expect(args.config).toBe(config);
      expect(args.key).toBe('voice.wav');
      expect(args.body).toBe(buffer);
      expect(args.contentType).toBe('audio/wav');
      expect(args.now).toBeInstanceOf(Date);
      expect(args.now?.toISOString()).toBe('2026-05-15T10:30:00.000Z');
    });

    it('calls httpPut with the signed url, headers, body and configured timeoutMs', async () => {
      const config = makeS3Config({ requestTimeoutMs: 7777 });
      const storage = new S3CompatibleAudioStorage(config);
      const buffer = Buffer.from('payload');

      await storage.save({
        buffer,
        contentType: 'audio/mpeg',
        objectKey: 'k.mp3',
      });

      expect(httpPutMock).toHaveBeenCalledTimes(1);
      expect(httpPutMock).toHaveBeenCalledWith({
        url: SIGNED_URL,
        headers: SIGNED_HEADERS,
        body: buffer,
        timeoutMs: 7777,
      });
    });

    it('returns a buildS3AudioRef-shaped reference for the normalized key', async () => {
      normalizeKeyMock.mockReturnValueOnce('tenant-7/custom.mp3');
      const storage = new S3CompatibleAudioStorage(makeS3Config({ objectKeyPrefix: 'tenant-7' }));

      const ref = await storage.save({
        buffer: Buffer.from('x'),
        contentType: 'audio/mpeg',
        objectKey: 'custom.mp3',
      });

      expect(ref).toBe('s3://tenant-7/custom.mp3');
    });
  });

  describe('getSignedReadUrl()', () => {
    it('returns null for refs missing the s3:// scheme', async () => {
      const storage = new S3CompatibleAudioStorage(makeS3Config());

      expect(await storage.getSignedReadUrl('https://cdn/foo.mp3')).toBeNull();
      expect(await storage.getSignedReadUrl('local-audio://foo.mp3')).toBeNull();
      expect(await storage.getSignedReadUrl('s3://')).toBeNull();
      expect(buildReadUrlMock).not.toHaveBeenCalled();
    });

    it('forwards the parsed key + config to buildS3PresignedReadUrl (no ttl override)', async () => {
      const config = makeS3Config();
      const storage = new S3CompatibleAudioStorage(config);

      const result = await storage.getSignedReadUrl('s3://chat-audios/2026/05/abc.mp3');

      expect(buildReadUrlMock).toHaveBeenCalledTimes(1);
      expect(buildReadUrlMock).toHaveBeenCalledWith({
        key: 'chat-audios/2026/05/abc.mp3',
        config,
        ttlSeconds: undefined,
      });
      expect(result).toEqual({
        url: 'https://signed.example/key.mp3?sig=abc',
        expiresAt: '2026-05-02T12:00:00.000Z',
      });
    });

    it('forwards the explicit ttlSeconds when provided', async () => {
      const config = makeS3Config();
      const storage = new S3CompatibleAudioStorage(config);

      await storage.getSignedReadUrl('s3://chat-audios/x.mp3', 600);

      expect(buildReadUrlMock).toHaveBeenCalledWith({
        key: 'chat-audios/x.mp3',
        config,
        ttlSeconds: 600,
      });
    });
  });

  describe('deleteByRef()', () => {
    it('is a no-op for refs missing the s3:// scheme', async () => {
      const storage = new S3CompatibleAudioStorage(makeS3Config());

      await expect(storage.deleteByRef('local-audio://x.mp3')).resolves.toBeUndefined();
      await expect(storage.deleteByRef('s3://')).resolves.toBeUndefined();
      expect(deleteBatchMock).not.toHaveBeenCalled();
    });

    it('calls deleteObjectsBatch with [parsed key] for a valid s3:// ref', async () => {
      const config = makeS3Config();
      const storage = new S3CompatibleAudioStorage(config);

      await storage.deleteByRef('s3://chat-audios/2026/05/zzz.mp3');

      expect(deleteBatchMock).toHaveBeenCalledTimes(1);
      expect(deleteBatchMock).toHaveBeenCalledWith(config, ['chat-audios/2026/05/zzz.mp3']);
    });
  });
});
