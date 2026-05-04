import type { CacheKeyInput } from '@modules/chat/useCase/message/chat-cache-key.util';

/**
 * Sensible defaults for a {@link CacheKeyInput}. The defaults intentionally
 * resolve to a *generic* (global-namespace) query so individual tests need
 * only override the dimension they exercise — overriding e.g. `userId` or
 * `hasGeo: true` then drives the key into the user-scoped namespace.
 *
 * Per CLAUDE.md UFR-002: every cache-key test MUST build inputs through
 * this factory rather than inlining the object shape.
 * @param overrides
 */
export const makeCacheKeyInput = (overrides: Partial<CacheKeyInput> = {}): CacheKeyInput => ({
  text: 'Tell me about this painting',
  museumId: 'louvre',
  locale: 'fr',
  guideLevel: 'beginner',
  audioDescriptionMode: false,
  hasHistory: false,
  hasAttachment: false,
  hasGeo: false,
  ...overrides,
});
