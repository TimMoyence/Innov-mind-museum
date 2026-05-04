import {
  sha256Hex,
  hmac,
  deriveSigningKey,
  toAmzDate,
  buildCanonicalHeaders,
  signString,
} from '@modules/chat/adapters/secondary/storage/s3-signing';

describe('s3-signing', () => {
  describe('sha256Hex', () => {
    it('returns correct SHA-256 hex digest for a string', () => {
      // SHA-256 of empty string is well-known
      const result = sha256Hex('');
      expect(result).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    });

    it('returns correct SHA-256 hex digest for a known input', () => {
      const result = sha256Hex('hello');
      expect(result).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
    });

    it('accepts Buffer input', () => {
      const result = sha256Hex(Buffer.from('hello'));
      expect(result).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
    });
  });

  describe('hmac', () => {
    it('returns a Buffer', () => {
      const result = hmac('key', 'data');
      expect(Buffer.isBuffer(result)).toBe(true);
    });

    it('produces deterministic output for same key and data', () => {
      const a = hmac('secret', 'message');
      const b = hmac('secret', 'message');
      expect(a.equals(b)).toBe(true);
    });

    it('produces different output for different keys', () => {
      const a = hmac('key1', 'data');
      const b = hmac('key2', 'data');
      expect(a.equals(b)).toBe(false);
    });
  });

  describe('deriveSigningKey', () => {
    it('derives a key using the SigV4 chain (secret -> date -> region -> s3 -> aws4_request)', () => {
      const key = deriveSigningKey(
        'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
        '20130524',
        'us-east-1',
      );
      expect(Buffer.isBuffer(key)).toBe(true);
      expect(key.length).toBe(32); // HMAC-SHA256 output is always 32 bytes
    });

    it('produces different keys for different regions', () => {
      const keyA = deriveSigningKey('secret', '20240101', 'us-east-1');
      const keyB = deriveSigningKey('secret', '20240101', 'eu-west-1');
      expect(keyA.equals(keyB)).toBe(false);
    });

    it('produces different keys for different dates', () => {
      const keyA = deriveSigningKey('secret', '20240101', 'us-east-1');
      const keyB = deriveSigningKey('secret', '20240102', 'us-east-1');
      expect(keyA.equals(keyB)).toBe(false);
    });
  });

  describe('toAmzDate', () => {
    it('formats a Date into AMZ date format', () => {
      const date = new Date('2024-06-15T12:30:45.123Z');
      const result = toAmzDate(date);
      expect(result.amzDate).toBe('20240615T123045Z');
      expect(result.dateStamp).toBe('20240615');
    });

    it('handles midnight correctly', () => {
      const date = new Date('2024-01-01T00:00:00.000Z');
      const result = toAmzDate(date);
      expect(result.amzDate).toBe('20240101T000000Z');
      expect(result.dateStamp).toBe('20240101');
    });

    it('strips milliseconds from the ISO string', () => {
      const date = new Date('2024-03-10T09:05:07.999Z');
      const result = toAmzDate(date);
      expect(result.amzDate).not.toContain('.');
      expect(result.amzDate).toBe('20240310T090507Z');
    });
  });

  describe('buildCanonicalHeaders', () => {
    it('lowercases and sorts header keys', () => {
      const result = buildCanonicalHeaders({
        'X-Amz-Date': '20240101T000000Z',
        Host: 'example.com',
      });
      expect(result.signedHeaders).toBe('host;x-amz-date');
      expect(result.canonicalHeaders).toBe('host:example.com\nx-amz-date:20240101T000000Z\n');
    });

    it('trims whitespace from keys and values', () => {
      const result = buildCanonicalHeaders({
        '  Host  ': '  example.com  ',
      });
      expect(result.signedHeaders).toBe('host');
      expect(result.canonicalHeaders).toBe('host:example.com\n');
    });

    it('collapses multiple spaces in values to single space', () => {
      const result = buildCanonicalHeaders({
        'X-Custom': 'a   b   c',
      });
      expect(result.canonicalHeaders).toBe('x-custom:a b c\n');
    });
  });

  describe('signString', () => {
    it('returns a scope in the expected format', () => {
      const result = signString({
        secretAccessKey: 'test-secret',
        dateStamp: '20240615',
        region: 'us-east-1',
        amzDate: '20240615T120000Z',
        canonicalRequest:
          'GET\n/\n\nhost:s3.amazonaws.com\n\nhost\ne3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      });
      expect(result.scope).toBe('20240615/us-east-1/s3/aws4_request');
    });

    it('returns a 64-character hex signature', () => {
      const result = signString({
        secretAccessKey: 'test-secret',
        dateStamp: '20240615',
        region: 'us-east-1',
        amzDate: '20240615T120000Z',
        canonicalRequest: 'GET\n/\n\nhost:example.com\n\nhost\nhash',
      });
      expect(result.signature).toMatch(/^[0-9a-f]{64}$/);
    });

    it('produces deterministic signature for same inputs', () => {
      const params = {
        secretAccessKey: 'my-secret',
        dateStamp: '20240101',
        region: 'eu-west-1',
        amzDate: '20240101T000000Z',
        canonicalRequest: 'PUT\n/bucket/key\n\nhost:s3.eu-west-1.amazonaws.com\n\nhost\nhash',
      };
      const a = signString(params);
      const b = signString(params);
      expect(a.signature).toBe(b.signature);
    });

    it('produces different signatures for different canonical requests', () => {
      const base = {
        secretAccessKey: 'my-secret',
        dateStamp: '20240101',
        region: 'us-east-1',
        amzDate: '20240101T000000Z',
      };
      const a = signString({ ...base, canonicalRequest: 'GET\n/' });
      const b = signString({ ...base, canonicalRequest: 'PUT\n/' });
      expect(a.signature).not.toBe(b.signature);
    });
  });
});
