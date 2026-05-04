import {
  buildCacheKey,
  isGenericQuery,
  GENERIC_TEXT_MAX_LEN,
  MAX_CACHE_KEY_BYTES,
} from '@modules/chat/useCase/message/chat-cache-key.util';

import { makeCacheKeyInput } from '../../helpers/chat/cache-fixtures';

describe('chat-cache-key — R1 hybrid scoping', () => {
  // -------------------------------------------------------------------------
  // Global namespace (cross-user safe)
  // -------------------------------------------------------------------------
  describe('global namespace (generic queries)', () => {
    it('two users in same museum asking the same generic question share the SAME global key', () => {
      const a = buildCacheKey(makeCacheKeyInput({ userId: 1 }));
      const b = buildCacheKey(makeCacheKeyInput({ userId: 2 }));
      expect(a).toBe(b);
      expect(a).toMatch(/^chat:llm:global:/);
    });

    it('same user, identical generic query → identical global key', () => {
      const a = buildCacheKey(makeCacheKeyInput({ userId: 42 }));
      const b = buildCacheKey(makeCacheKeyInput({ userId: 42 }));
      expect(a).toBe(b);
    });

    it('different museums produce different global keys', () => {
      const a = buildCacheKey(makeCacheKeyInput({ museumId: 'louvre' }));
      const b = buildCacheKey(makeCacheKeyInput({ museumId: 'orsay' }));
      expect(a).not.toBe(b);
    });

    it('locale change → different global key', () => {
      const fr = buildCacheKey(makeCacheKeyInput({ locale: 'fr' }));
      const en = buildCacheKey(makeCacheKeyInput({ locale: 'en' }));
      expect(fr).not.toBe(en);
    });

    it('guideLevel change → different global key', () => {
      const beginner = buildCacheKey(makeCacheKeyInput({ guideLevel: 'beginner' }));
      const expert = buildCacheKey(makeCacheKeyInput({ guideLevel: 'expert' }));
      expect(beginner).not.toBe(expert);
    });

    it('audioDescriptionMode change → different global key', () => {
      const off = buildCacheKey(makeCacheKeyInput({ audioDescriptionMode: false }));
      const on = buildCacheKey(makeCacheKeyInput({ audioDescriptionMode: true }));
      expect(off).not.toBe(on);
    });
  });

  // -------------------------------------------------------------------------
  // User-scoped namespace (no leak)
  // -------------------------------------------------------------------------
  describe('user-scoped namespace', () => {
    it('two different users with geo → DIFFERENT user-scoped keys (no leak)', () => {
      const userA = buildCacheKey(
        makeCacheKeyInput({ userId: 1, hasGeo: true, geoBucket: 'Paris|FR' }),
      );
      const userB = buildCacheKey(
        makeCacheKeyInput({ userId: 2, hasGeo: true, geoBucket: 'Paris|FR' }),
      );
      expect(userA).not.toBe(userB);
      expect(userA).toMatch(/^chat:llm:user:1:/);
      expect(userB).toMatch(/^chat:llm:user:2:/);
    });

    it('same user, with vs without history → different keys', () => {
      const noHist = buildCacheKey(makeCacheKeyInput({ userId: 9 }));
      const withHist = buildCacheKey(makeCacheKeyInput({ userId: 9, hasHistory: true }));
      expect(noHist).not.toBe(withHist);
      expect(withHist).toMatch(/^chat:llm:user:9:/);
    });

    it('same user, with vs without attachment → different keys', () => {
      const noAtt = buildCacheKey(makeCacheKeyInput({ userId: 9 }));
      const withAtt = buildCacheKey(makeCacheKeyInput({ userId: 9, hasAttachment: true }));
      expect(noAtt).not.toBe(withAtt);
      expect(withAtt).toMatch(/^chat:llm:user:9:/);
    });

    it('long text (≥ GENERIC_TEXT_MAX_LEN) → user-scoped even when otherwise generic', () => {
      const longText = 'a'.repeat(GENERIC_TEXT_MAX_LEN);
      const key = buildCacheKey(makeCacheKeyInput({ userId: 5, text: longText }));
      expect(key).toMatch(/^chat:llm:user:5:/);
    });

    it("different geoBuckets → different user-scoped keys (cities don't share)", () => {
      const paris = buildCacheKey(
        makeCacheKeyInput({ userId: 5, hasGeo: true, geoBucket: 'Paris|FR' }),
      );
      const lyon = buildCacheKey(
        makeCacheKeyInput({ userId: 5, hasGeo: true, geoBucket: 'Lyon|FR' }),
      );
      expect(paris).not.toBe(lyon);
    });

    it('two users in same coarse geoBucket → different keys (still scoped per-user)', () => {
      const userA = buildCacheKey(
        makeCacheKeyInput({ userId: 1, hasGeo: true, geoBucket: 'Paris|FR' }),
      );
      const userB = buildCacheKey(
        makeCacheKeyInput({ userId: 2, hasGeo: true, geoBucket: 'Paris|FR' }),
      );
      expect(userA).not.toBe(userB);
    });
  });

  // -------------------------------------------------------------------------
  // Anon namespace (frontend guest mode)
  // -------------------------------------------------------------------------
  describe('anon namespace', () => {
    it('anonId routes to anon namespace when scoping is required', () => {
      const key = buildCacheKey(makeCacheKeyInput({ anonId: 'device-xyz', hasAttachment: true }));
      expect(key).toMatch(/^chat:llm:anon:device-xyz:/);
    });
  });

  // -------------------------------------------------------------------------
  // Defensive guards
  // -------------------------------------------------------------------------
  describe('defensive guards', () => {
    it('throws when scoped key requested without userId or anonId', () => {
      expect(() =>
        buildCacheKey(makeCacheKeyInput({ hasGeo: true, geoBucket: 'Paris|FR' })),
      ).toThrow(/refusing to leak globally/);
    });

    it('throws when missing userId AND any context flag is true', () => {
      expect(() => buildCacheKey(makeCacheKeyInput({ hasHistory: true }))).toThrow(
        /refusing to leak globally/,
      );
    });

    it('produced key never exceeds the Redis-safe byte limit', () => {
      const key = buildCacheKey(
        makeCacheKeyInput({
          userId: 999_999_999,
          museumId: 'a-very-long-museum-identifier-string',
          hasGeo: true,
          geoBucket: 'Paris|FR',
        }),
      );
      expect(Buffer.byteLength(key, 'utf8')).toBeLessThanOrEqual(MAX_CACHE_KEY_BYTES);
    });

    it('fine geo coordinates never appear in the key string', () => {
      // Caller must pass a coarse bucket; the function does not accept lat/lng
      // and the unit input has no field for them. Smoke-check the typed shape:
      const key = buildCacheKey(
        makeCacheKeyInput({ userId: 1, hasGeo: true, geoBucket: 'Paris|FR' }),
      );
      // No decimal-degree pattern slips through (defensive regex).
      expect(key).not.toMatch(/-?\d{1,3}\.\d{4,}/);
    });
  });

  // -------------------------------------------------------------------------
  // isGenericQuery helper (exported for testability)
  // -------------------------------------------------------------------------
  describe('isGenericQuery', () => {
    it('returns true only when ALL signals are absent and text is short', () => {
      expect(isGenericQuery(makeCacheKeyInput())).toBe(true);
    });

    it('returns false when geo is present', () => {
      expect(isGenericQuery(makeCacheKeyInput({ hasGeo: true }))).toBe(false);
    });

    it('returns false when history is present', () => {
      expect(isGenericQuery(makeCacheKeyInput({ hasHistory: true }))).toBe(false);
    });

    it('returns false when attachment is present', () => {
      expect(isGenericQuery(makeCacheKeyInput({ hasAttachment: true }))).toBe(false);
    });

    it('returns false when text length reaches GENERIC_TEXT_MAX_LEN', () => {
      expect(isGenericQuery(makeCacheKeyInput({ text: 'a'.repeat(GENERIC_TEXT_MAX_LEN) }))).toBe(
        false,
      );
    });

    it('default-safe: undefined flags resolve to "context present" (false)', () => {
      // Strip the explicit defaults from the factory and rely on undefineds.
      const result = isGenericQuery({
        text: 'hello',
        museumId: 'm',
        locale: 'fr',
        guideLevel: 'beginner',
        audioDescriptionMode: false,
      });
      expect(result).toBe(false);
    });
  });
});
