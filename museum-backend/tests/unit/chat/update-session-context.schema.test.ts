import { updateSessionContextSchema } from '@modules/chat/adapters/primary/http/schemas/chat-session.schemas';

/**
 * W3 (T5.3) — unit tests for the `updateSessionContextSchema` Zod schema
 * (defence in depth — UUID v4 server-side, never trust FE-parsed values).
 *
 * Spec: docs/team-state/2026-05-17-w3-geo-walk-intra/spec.md R19/R20.
 */

const VALID_UUID = '01234567-89ab-4cde-9012-3456789abcde';
const VALID_UUID_2 = 'aaaaaaaa-bbbb-4ccc-9ddd-eeeeeeeeeeee';

describe('updateSessionContextSchema (W3 T5.3)', () => {
  describe('valid payloads', () => {
    it('accepts both fields set to valid v4 UUIDs', () => {
      const result = updateSessionContextSchema.safeParse({
        currentArtworkId: VALID_UUID,
        currentRoom: VALID_UUID_2,
      });
      expect(result.success).toBe(true);
    });

    it('accepts currentArtworkId alone', () => {
      const result = updateSessionContextSchema.safeParse({ currentArtworkId: VALID_UUID });
      expect(result.success).toBe(true);
    });

    it('accepts currentRoom alone', () => {
      const result = updateSessionContextSchema.safeParse({ currentRoom: VALID_UUID });
      expect(result.success).toBe(true);
    });

    it('accepts explicit null (clear) for either field', () => {
      const result = updateSessionContextSchema.safeParse({
        currentArtworkId: null,
        currentRoom: null,
      });
      expect(result.success).toBe(true);
    });

    it('accepts uppercase hex in v4 UUIDs', () => {
      const result = updateSessionContextSchema.safeParse({
        currentArtworkId: VALID_UUID.toUpperCase(),
      });
      expect(result.success).toBe(true);
    });
  });

  describe('invalid payloads', () => {
    it('rejects empty body (no fields → no-op call)', () => {
      const result = updateSessionContextSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('rejects non-v4 UUID (e.g. version nibble 3)', () => {
      const v3 = VALID_UUID.replace('4cde', '3cde');
      const result = updateSessionContextSchema.safeParse({ currentArtworkId: v3 });
      expect(result.success).toBe(false);
    });

    it('rejects non-RFC-4122 variant nibble', () => {
      const badVariant = VALID_UUID.replace('-9012-', '-7012-');
      const result = updateSessionContextSchema.safeParse({ currentRoom: badVariant });
      expect(result.success).toBe(false);
    });

    it('rejects a non-UUID string', () => {
      const result = updateSessionContextSchema.safeParse({
        currentArtworkId: 'not-a-uuid',
      });
      expect(result.success).toBe(false);
    });

    it('rejects a non-string non-null type', () => {
      const result = updateSessionContextSchema.safeParse({
        currentArtworkId: 42 as unknown as string,
      });
      expect(result.success).toBe(false);
    });

    it('rejects injection-style payload (URL with embedded UUID)', () => {
      const result = updateSessionContextSchema.safeParse({
        currentArtworkId: `https://attacker.example.com/?id=${VALID_UUID}`,
      });
      expect(result.success).toBe(false);
    });
  });
});
