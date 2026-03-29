import { z } from 'zod';

import { CursorCodec } from '@shared/pagination/cursor-codec';

const schema = z.object({ createdAt: z.string(), id: z.string() });
const codec = new CursorCodec(schema);

describe('CursorCodec', () => {
  describe('encode / decode round-trip', () => {
    it('should round-trip a valid cursor', () => {
      const original = { createdAt: '2026-03-29T10:00:00.000Z', id: 'abc-123' };
      const encoded = codec.encode(original);
      const decoded = codec.decode(encoded);

      expect(decoded).toEqual(original);
    });

    it('should produce a Base64URL string without padding', () => {
      const encoded = codec.encode({ createdAt: '2026-01-01T00:00:00Z', id: 'x' });

      // Base64URL alphabet: A-Z, a-z, 0-9, -, _  (no + / =)
      expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    });
  });

  describe('decode with invalid input', () => {
    it('should return null for invalid base64', () => {
      expect(codec.decode('%%%not-base64!!!')).toBeNull();
    });

    it('should return null for corrupt JSON', () => {
      const corrupt = Buffer.from('{{{{', 'utf8').toString('base64url');
      expect(codec.decode(corrupt)).toBeNull();
    });

    it('should return null when schema validation fails', () => {
      // Valid JSON but wrong shape (missing 'id')
      const wrong = Buffer.from(JSON.stringify({ createdAt: '2026-01-01' }), 'utf8').toString(
        'base64url',
      );
      expect(codec.decode(wrong)).toBeNull();
    });

    it('should return null when field types are wrong', () => {
      const wrongTypes = Buffer.from(JSON.stringify({ createdAt: 123, id: true }), 'utf8').toString(
        'base64url',
      );
      expect(codec.decode(wrongTypes)).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(codec.decode('')).toBeNull();
    });
  });

  describe('different schemas', () => {
    it('should work with updatedAt/id schema', () => {
      const sessionSchema = z.object({ updatedAt: z.string(), id: z.string() });
      const sessionCodec = new CursorCodec(sessionSchema);

      const original = { updatedAt: '2026-03-29T12:00:00.000Z', id: 'session-1' };
      const encoded = sessionCodec.encode(original);
      const decoded = sessionCodec.decode(encoded);

      expect(decoded).toEqual(original);
    });

    it('should reject wrong schema shape cross-codec', () => {
      const sessionSchema = z.object({ updatedAt: z.string(), id: z.string() });
      const sessionCodec = new CursorCodec(sessionSchema);

      // Encode with message codec, decode with session codec — should fail
      const encoded = codec.encode({ createdAt: '2026-01-01T00:00:00Z', id: 'x' });
      expect(sessionCodec.decode(encoded)).toBeNull();
    });
  });
});
