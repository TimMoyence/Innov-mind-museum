import {
  parseContext,
  toImageSource,
  buildImageReadUrl,
  resolveRequestBaseUrl,
  getRequestUser,
  contentTypeByExtension,
  upload,
  audioUpload,
} from '@modules/chat/adapters/primary/http/chat-route.helpers';

jest.mock('@modules/chat/adapters/primary/http/chat.image-url', () => ({
  buildSignedChatImageReadUrl: jest.fn(() => ({
    url: 'http://localhost/signed-url',
    expiresAt: '2026-01-01T00:00:00.000Z',
  })),
}));

jest.mock('@modules/chat/adapters/secondary/image-storage.s3', () => ({
  isS3ImageRef: jest.fn((ref: string) => typeof ref === 'string' && ref.startsWith('s3://')),
  buildS3SignedReadUrlFromRef: jest.fn(() => ({
    url: 'https://s3.example.com/signed',
    expiresAt: '2026-01-01T00:00:00.000Z',
  })),
}));

jest.mock('@src/config/env', () => ({
  env: {
    llm: {
      totalBudgetMs: 30000,
      maxImageBytes: 10 * 1024 * 1024,
      maxAudioBytes: 25 * 1024 * 1024,
    },
    upload: {
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
      allowedAudioMimeTypes: ['audio/mp4', 'audio/mpeg', 'audio/webm', 'audio/wav', 'audio/x-m4a'],
    },
    storage: {
      s3: {
        endpoint: 'https://s3.example.com',
        region: 'us-east-1',
        bucket: 'test-bucket',
        accessKeyId: 'AKID',
        secretAccessKey: 'SECRET',
        publicBaseUrl: undefined,
        sessionToken: undefined,
      },
      signingSecret: 'test-signing-secret-32-chars-long!!',
      signedUrlTtlSeconds: 3600,
    },
  },
}));

/**
 * Extracts the multer fileFilter from a multer instance. The typings don't
 * expose it, but at runtime it is stored on the instance we configured.
 */
type FileFilterFn = (
  req: unknown,
  file: { mimetype: string },
  cb: (err: Error | null, acceptFile?: boolean) => void,
) => void;

const getFileFilter = (multerInstance: unknown): FileFilterFn => {
  const filter = (multerInstance as { fileFilter?: FileFilterFn }).fileFilter;
  if (typeof filter !== 'function') {
    throw new Error('multer instance is missing a fileFilter');
  }
  return filter;
};

const runFilter = (
  multerInstance: unknown,
  mimetype: string,
): { err: Error | null; accept: boolean | undefined } => {
  const filter = getFileFilter(multerInstance);
  let err: Error | null = null;
  let accept: boolean | undefined;
  filter({}, { mimetype }, (cbErr, cbAccept) => {
    err = cbErr;
    accept = cbAccept;
  });
  return { err, accept };
};

describe('chat-route.helpers — uncovered branches', () => {
  describe('parseContext — field validation branches', () => {
    it('throws 400 when location is a non-string value', () => {
      expect(() => parseContext({ location: 42 })).toThrow('context.location must be a string');
    });

    it('throws 400 when location is a boolean', () => {
      expect(() => parseContext({ location: true })).toThrow('context.location must be a string');
    });

    it('converts museumMode string "true" to boolean true', () => {
      const result = parseContext({ museumMode: 'true' });
      expect(result?.museumMode).toBe(true);
    });

    it('converts museumMode string "false" to boolean false', () => {
      const result = parseContext({ museumMode: 'false' });
      expect(result?.museumMode).toBe(false);
    });

    it('converts museumMode string "TRUE" (case-insensitive) to boolean true', () => {
      const result = parseContext({ museumMode: 'TRUE' });
      expect(result?.museumMode).toBe(true);
    });

    it('throws 400 for museumMode with invalid string value', () => {
      expect(() => parseContext({ museumMode: 'yes' })).toThrow(
        'context.museumMode must be a boolean',
      );
    });

    it('throws 400 for museumMode with numeric value', () => {
      expect(() => parseContext({ museumMode: 1 })).toThrow('context.museumMode must be a boolean');
    });

    it('passes museumMode boolean true directly', () => {
      const result = parseContext({ museumMode: true });
      expect(result?.museumMode).toBe(true);
    });

    it('throws 400 for guideLevel with invalid enum value', () => {
      expect(() => parseContext({ guideLevel: 'master' })).toThrow(
        'context.guideLevel must be beginner, intermediate, or expert',
      );
    });

    it('throws 400 for guideLevel with non-string value', () => {
      expect(() => parseContext({ guideLevel: 42 })).toThrow('context.guideLevel must be a string');
    });

    it('accepts guideLevel "expert"', () => {
      const result = parseContext({ guideLevel: 'expert' });
      expect(result?.guideLevel).toBe('expert');
    });

    it('throws 400 for locale with non-string value', () => {
      expect(() => parseContext({ locale: 123 })).toThrow('context.locale must be a string');
    });

    it('throws 400 when context is an array', () => {
      expect(() => parseContext([1, 2, 3])).toThrow('context must be an object');
    });

    it('throws 400 when context string is invalid JSON', () => {
      expect(() => parseContext('{bad json')).toThrow(
        'context must be valid JSON when provided as string',
      );
    });

    it('returns only defined fields in parsed context', () => {
      const result = parseContext({ locale: 'fr' });
      expect(result).toEqual({ locale: 'fr' });
      expect(result).not.toHaveProperty('location');
      expect(result).not.toHaveProperty('museumMode');
      expect(result).not.toHaveProperty('guideLevel');
    });
  });

  describe('toImageSource', () => {
    it('returns "url" for http:// URI', () => {
      expect(toImageSource('http://example.com/img.jpg')).toBe('url');
    });

    it('returns "url" for https:// URI', () => {
      expect(toImageSource('https://example.com/img.jpg')).toBe('url');
    });

    it('returns "base64" for data URI', () => {
      expect(toImageSource('data:image/png;base64,iVBORw0KGgo...')).toBe('base64');
    });

    it('returns "base64" for raw base64 string', () => {
      expect(toImageSource('iVBORw0KGgoAAAANSUhEUg...')).toBe('base64');
    });

    it('returns "base64" for s3:// URI', () => {
      expect(toImageSource('s3://bucket/key.jpg')).toBe('base64');
    });

    it('returns "base64" for file:// URI', () => {
      expect(toImageSource('file:///tmp/image.png')).toBe('base64');
    });
  });

  describe('resolveRequestBaseUrl', () => {
    it('returns full URL from protocol and host', () => {
      const req = {
        protocol: 'https',
        get: (name: string) => (name === 'host' ? 'api.example.com' : undefined),
      };
      expect(resolveRequestBaseUrl(req)).toBe('https://api.example.com');
    });

    it('returns null when host header is missing', () => {
      const req = {
        protocol: 'https',
        get: () => undefined,
      };
      expect(resolveRequestBaseUrl(req)).toBeNull();
    });

    it('returns null when host header is empty string', () => {
      const req = {
        protocol: 'https',
        get: () => '   ',
      };
      expect(resolveRequestBaseUrl(req)).toBeNull();
    });

    it('defaults protocol to http when protocol is empty', () => {
      const req = {
        protocol: '',
        get: (name: string) => (name === 'host' ? 'localhost:3000' : undefined),
      };
      expect(resolveRequestBaseUrl(req)).toBe('http://localhost:3000');
    });

    it('handles missing get method gracefully', () => {
      const req = { protocol: 'https' };
      expect(resolveRequestBaseUrl(req)).toBeNull();
    });
  });

  describe('buildImageReadUrl', () => {
    it('returns signed S3 URL for s3:// image ref', () => {
      const result = buildImageReadUrl({
        baseUrl: 'http://localhost:3000',
        messageId: 'msg-1',
        imageRef: 's3://chat-images/test.jpg',
      });
      expect(result).not.toBeNull();
      expect(result?.url).toContain('s3.example.com');
    });

    it('returns null for s3:// ref when S3 config is incomplete', () => {
      // Temporarily remove a required S3 config value
      const { env } = jest.requireMock('@src/config/env') as {
        env: { storage: { s3: Record<string, unknown> } };
      };
      const originalEndpoint = env.storage.s3.endpoint;
      env.storage.s3.endpoint = undefined;

      const result = buildImageReadUrl({
        baseUrl: 'http://localhost:3000',
        messageId: 'msg-1',
        imageRef: 's3://chat-images/test.jpg',
      });
      expect(result).toBeNull();

      env.storage.s3.endpoint = originalEndpoint;
    });

    it('returns local signed URL for non-s3 ref with baseUrl', () => {
      const result = buildImageReadUrl({
        baseUrl: 'http://localhost:3000',
        messageId: 'msg-1',
        imageRef: 'local://test.jpg',
      });
      expect(result).not.toBeNull();
      expect(result?.url).toContain('signed-url');
    });

    it('returns null for non-s3 ref when baseUrl is null', () => {
      const result = buildImageReadUrl({
        baseUrl: null,
        messageId: 'msg-1',
        imageRef: 'local://test.jpg',
      });
      expect(result).toBeNull();
    });
  });

  describe('getRequestUser', () => {
    it('returns user from request with user property', () => {
      const req = { user: { id: 42 } } as never;
      expect(getRequestUser(req)).toEqual({ id: 42 });
    });

    it('returns undefined when user is not on request', () => {
      const req = {} as never;
      expect(getRequestUser(req)).toBeUndefined();
    });
  });

  describe('upload fileFilter (image)', () => {
    it('accepts image/jpeg', () => {
      const { err, accept } = runFilter(upload, 'image/jpeg');
      expect(err).toBeNull();
      expect(accept).toBe(true);
    });

    it('accepts image/png', () => {
      const { err, accept } = runFilter(upload, 'image/png');
      expect(err).toBeNull();
      expect(accept).toBe(true);
    });

    it('accepts image/webp', () => {
      const { err, accept } = runFilter(upload, 'image/webp');
      expect(err).toBeNull();
      expect(accept).toBe(true);
    });

    it('is case-insensitive on the incoming mimetype', () => {
      const { err, accept } = runFilter(upload, 'IMAGE/JPEG');
      expect(err).toBeNull();
      expect(accept).toBe(true);
    });

    it('rejects image/gif with a 400-style error', () => {
      const { err } = runFilter(upload, 'image/gif');
      expect(err).toBeInstanceOf(Error);
      expect(err?.message).toContain('Unsupported image content type');
      expect(err?.message).toContain('image/gif');
    });

    it('rejects application/pdf disguised as an image upload', () => {
      const { err } = runFilter(upload, 'application/pdf');
      expect(err).toBeInstanceOf(Error);
      expect(err?.message).toContain('Unsupported image content type');
    });

    it('rejects empty/missing mimetype', () => {
      const { err } = runFilter(upload, '');
      expect(err).toBeInstanceOf(Error);
      expect(err?.message).toContain('Unsupported image content type');
    });
  });

  describe('audioUpload fileFilter (audio)', () => {
    it('accepts audio/mp4', () => {
      const { err, accept } = runFilter(audioUpload, 'audio/mp4');
      expect(err).toBeNull();
      expect(accept).toBe(true);
    });

    it('accepts audio/mpeg', () => {
      const { err, accept } = runFilter(audioUpload, 'audio/mpeg');
      expect(err).toBeNull();
      expect(accept).toBe(true);
    });

    it('accepts audio/webm', () => {
      const { err, accept } = runFilter(audioUpload, 'audio/webm');
      expect(err).toBeNull();
      expect(accept).toBe(true);
    });

    it('accepts audio/x-m4a (iOS recorder output)', () => {
      const { err, accept } = runFilter(audioUpload, 'audio/x-m4a');
      expect(err).toBeNull();
      expect(accept).toBe(true);
    });

    it('rejects image/jpeg on the audio endpoint', () => {
      const { err } = runFilter(audioUpload, 'image/jpeg');
      expect(err).toBeInstanceOf(Error);
      expect(err?.message).toContain('Unsupported audio content type');
    });

    it('rejects application/octet-stream', () => {
      const { err } = runFilter(audioUpload, 'application/octet-stream');
      expect(err).toBeInstanceOf(Error);
      expect(err?.message).toContain('Unsupported audio content type');
    });
  });

  describe('contentTypeByExtension', () => {
    it('maps jpg to image/jpeg', () => {
      expect(contentTypeByExtension.jpg).toBe('image/jpeg');
    });

    it('maps png to image/png', () => {
      expect(contentTypeByExtension.png).toBe('image/png');
    });

    it('maps webp to image/webp', () => {
      expect(contentTypeByExtension.webp).toBe('image/webp');
    });

    it('returns undefined for unsupported extension', () => {
      expect(contentTypeByExtension.bmp).toBeUndefined();
    });
  });
});
