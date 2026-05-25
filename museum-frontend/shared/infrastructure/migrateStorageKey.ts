import { storage } from '@/shared/infrastructure/storage';

/**
 * One-shot legacy → new AsyncStorage key reader (TD-AS-01).
 *
 * When the app's inconsistent storage keys are re-prefixed to the
 * `musaium.<feature>.<key>` namespace, a naive rename would orphan every
 * persisted user preference. This helper copies the legacy value to the new
 * key — but ONLY when the new key is empty AND the legacy key holds data —
 * then drops the legacy key, so no user data is lost across the rename.
 *
 * Contract (design.md §4):
 *   1. read `newKey`
 *   2. if `newKey` is non-null AND non-empty → return (no-op; idempotent + no overwrite)
 *   3. else read `legacyKey`
 *   4. if `legacyKey` is null/empty → return (no-op)
 *   5. else `setItem(newKey, legacyValue)` then `removeItem(legacyKey)`
 *
 * The legacy value is copied as an opaque string (no parse / re-serialize), so
 * JSON payloads are preserved byte-for-byte (PATTERNS.md §3 "copy the legacy
 * value as an opaque string"). Operates on the string layer of the `storage`
 * wrapper, which works uniformly for both `getItem` and `getJSON` keys.
 *
 * Best-effort: every AsyncStorage error is swallowed. A failed migration must
 * never throw to the caller of a read — at worst the read falls back to the
 * feature's default (graceful degradation, design.md §8).
 *
 * @param newKey - The destination key under the `musaium.<feature>.<key>` namespace.
 * @param legacyKey - The pre-namespacing key whose value is migrated forward once.
 */
export const migrateStorageKey = async (newKey: string, legacyKey: string): Promise<void> => {
  try {
    const existing = await storage.getItem(newKey);
    if (existing !== null && existing.length > 0) {
      // New key already holds data → idempotent no-op, never overwrite.
      return;
    }

    const legacyValue = await storage.getItem(legacyKey);
    if (legacyValue === null || legacyValue.length === 0) {
      // Nothing to migrate forward.
      return;
    }

    await storage.setItem(newKey, legacyValue);
    await storage.removeItem(legacyKey);
  } catch {
    // Best-effort migration — swallow storage errors so a failed copy/remove
    // never crashes the read path. The read falls back to defaults.
  }
};
