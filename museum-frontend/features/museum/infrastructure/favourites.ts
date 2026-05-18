/**
 * W3 Cluster C — Museum favourites CRUD.
 *
 * Persistent list of museum IDs the visitor has marked as favourites.
 * Backed by `AsyncStorage` under the key `museum.favourites` (JSON array of
 * positive integers). All operations tolerate storage failures silently —
 * UFR-016: never throw from a side-effect helper.
 *
 * Spec : `team-state/2026-05-17-w3-geo-walk-intra/spec.md` R15-R16.
 */

import { storage } from '@/shared/infrastructure/storage';

/** AsyncStorage key under which the JSON-encoded favourites array lives. */
export const MUSEUM_FAVOURITES_STORAGE_KEY = 'museum.favourites';

/**
 * Reads the favourites array from storage. Always resolves — returns `[]`
 * on missing key, parse failure, or storage error. Filters out any non
 * positive-integer entries (defensive against schema drift).
 */
export async function getFavourites(): Promise<number[]> {
  try {
    const raw = await storage.getItem(MUSEUM_FAVOURITES_STORAGE_KEY);
    if (raw === null || raw.length === 0) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (id): id is number => typeof id === 'number' && Number.isInteger(id) && id > 0,
    );
  } catch {
    return [];
  }
}

/**
 * Adds a museum to the favourites list. Idempotent — duplicates are
 * de-duped before write. Newest entry first (LRU-style) so the favourites
 * strip surfaces the most recently picked museums.
 */
export async function addFavourite(museumId: number): Promise<void> {
  if (!Number.isInteger(museumId) || museumId <= 0) return;
  try {
    const current = await getFavourites();
    const next = [museumId, ...current.filter((id) => id !== museumId)];
    await storage.setItem(MUSEUM_FAVOURITES_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage write failed → silent. Picker still works as a non-persistent flow.
  }
}

/** Removes a museum from the favourites list. No-op when not present / on failure. */
export async function removeFavourite(museumId: number): Promise<void> {
  try {
    const current = await getFavourites();
    const next = current.filter((id) => id !== museumId);
    await storage.setItem(MUSEUM_FAVOURITES_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Silent.
  }
}
