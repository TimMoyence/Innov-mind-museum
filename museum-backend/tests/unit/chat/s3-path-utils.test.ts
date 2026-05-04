import {
  encodeRfc3986,
  encodePathSegments,
  normalizeEndpoint,
  buildObjectPath,
  joinKeyParts,
  normalizeObjectKey,
  buildReadBaseUrlAndPath,
} from '@modules/chat/adapters/secondary/storage/s3-path-utils';

describe('s3-path-utils', () => {
  describe('encodeRfc3986', () => {
    it('encodes spaces as %20', () => {
      expect(encodeRfc3986('hello world')).toBe('hello%20world');
    });

    it('encodes special chars that encodeURIComponent leaves unencoded', () => {
      expect(encodeRfc3986("!'()*")).toBe('%21%27%28%29%2A');
    });

    it('passes through alphanumeric characters', () => {
      expect(encodeRfc3986('abc123')).toBe('abc123');
    });
  });

  describe('encodePathSegments', () => {
    it('encodes each path segment', () => {
      expect(encodePathSegments('my bucket/my key')).toBe('my%20bucket/my%20key');
    });

    it('filters out empty segments from leading/trailing slashes', () => {
      expect(encodePathSegments('/a/b/')).toBe('a/b');
    });

    it('filters out empty segments from double slashes', () => {
      expect(encodePathSegments('a//b')).toBe('a/b');
    });
  });

  describe('normalizeEndpoint', () => {
    it('parses a valid HTTPS endpoint', () => {
      const url = normalizeEndpoint('https://s3.amazonaws.com/');
      expect(url.hostname).toBe('s3.amazonaws.com');
      expect(url.protocol).toBe('https:');
    });

    it('strips trailing slashes from pathname', () => {
      const url = normalizeEndpoint('https://example.com/base///');
      expect(url.pathname).toBe('/base');
    });

    it('throws on empty endpoint', () => {
      expect(() => normalizeEndpoint('')).toThrow('S3 endpoint is required');
      expect(() => normalizeEndpoint('   ')).toThrow('S3 endpoint is required');
    });

    it('throws on non-http/https protocol', () => {
      expect(() => normalizeEndpoint('ftp://example.com')).toThrow(
        'S3 endpoint must use http or https',
      );
    });

    it('accepts http protocol', () => {
      const url = normalizeEndpoint('http://localhost:9000');
      expect(url.protocol).toBe('http:');
    });
  });

  describe('buildObjectPath', () => {
    it('builds a path with bucket and key', () => {
      const result = buildObjectPath({ bucket: 'my-bucket', key: 'photos/img.jpg' });
      expect(result).toBe('/my-bucket/photos/img.jpg');
    });

    it('includes endpoint base path', () => {
      const result = buildObjectPath({ bucket: 'b', key: 'k', endpointPath: '/base' });
      expect(result).toBe('/base/b/k');
    });

    it('normalizes double slashes', () => {
      const result = buildObjectPath({ bucket: 'b', key: 'k', endpointPath: '/base/' });
      expect(result).not.toContain('//');
    });
  });

  describe('joinKeyParts', () => {
    it('joins parts with slashes', () => {
      expect(joinKeyParts('prefix', 'folder', 'file.jpg')).toBe('prefix/folder/file.jpg');
    });

    it('filters out undefined and empty parts', () => {
      expect(joinKeyParts(undefined, '', ' ', 'file.jpg')).toBe('file.jpg');
    });

    it('splits and re-joins parts that contain slashes', () => {
      expect(joinKeyParts('a/b', 'c/d')).toBe('a/b/c/d');
    });
  });

  describe('normalizeObjectKey', () => {
    it('normalizes a simple key', () => {
      expect(normalizeObjectKey({ key: 'img.jpg' })).toBe('img.jpg');
    });

    it('prepends optional prefix', () => {
      expect(normalizeObjectKey({ key: 'img.jpg', objectKeyPrefix: 'uploads' })).toBe(
        'uploads/img.jpg',
      );
    });

    it('throws on empty key', () => {
      expect(() => normalizeObjectKey({ key: '' })).toThrow('S3 object key cannot be empty');
    });

    it('rejects path traversal with ".."', () => {
      expect(() => normalizeObjectKey({ key: '../etc/passwd' })).toThrow('invalid path traversal');
    });

    it('rejects path traversal embedded in middle of path', () => {
      expect(() => normalizeObjectKey({ key: 'uploads/../../../etc/passwd' })).toThrow(
        'invalid path traversal',
      );
    });

    it('rejects path traversal in prefix', () => {
      expect(() => normalizeObjectKey({ key: 'file.jpg', objectKeyPrefix: '../escape' })).toThrow(
        'invalid path traversal',
      );
    });
  });

  describe('buildReadBaseUrlAndPath', () => {
    it('builds URL with bucket-in-path style', () => {
      const result = buildReadBaseUrlAndPath({
        endpoint: 'https://s3.amazonaws.com',
        bucket: 'my-bucket',
        key: 'photo.jpg',
      });
      expect(result.url.toString()).toContain('my-bucket');
      expect(result.url.toString()).toContain('photo.jpg');
    });

    it('detects bucket-in-host style', () => {
      const result = buildReadBaseUrlAndPath({
        endpoint: 'https://my-bucket.s3.amazonaws.com',
        bucket: 'my-bucket',
        key: 'photo.jpg',
      });
      expect(result.objectPath).toContain('photo.jpg');
      // Should not duplicate bucket in path when bucket is already in host
      const pathOccurrences = (result.objectPath.match(/my-bucket/g) ?? []).length;
      expect(pathOccurrences).toBe(0);
    });

    it('uses publicBaseUrl when provided', () => {
      const result = buildReadBaseUrlAndPath({
        endpoint: 'https://internal-s3.example.com',
        publicBaseUrl: 'https://cdn.example.com',
        bucket: 'assets',
        key: 'image.png',
      });
      expect(result.url.hostname).toBe('cdn.example.com');
    });

    it('replaces {bucket} placeholder in publicBaseUrl', () => {
      const result = buildReadBaseUrlAndPath({
        endpoint: 'https://s3.amazonaws.com',
        publicBaseUrl: 'https://{bucket}.cdn.example.com',
        bucket: 'my-bucket',
        key: 'photo.jpg',
      });
      expect(result.url.hostname).toBe('my-bucket.cdn.example.com');
    });

    it('detects bucket-in-path from endpoint pathname', () => {
      const result = buildReadBaseUrlAndPath({
        endpoint: 'https://s3.example.com/my-bucket',
        bucket: 'my-bucket',
        key: 'file.txt',
      });
      expect(result.objectPath).toContain('file.txt');
    });
  });
});
