import { storage } from '@/shared/infrastructure/storage';

export const MUSEUM_FAVOURITES_STORAGE_KEY = 'museum.favourites';

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

export async function addFavourite(museumId: number): Promise<void> {
  if (!Number.isInteger(museumId) || museumId <= 0) return;
  try {
    const current = await getFavourites();
    const next = [museumId, ...current.filter((id) => id !== museumId)];
    await storage.setItem(MUSEUM_FAVOURITES_STORAGE_KEY, JSON.stringify(next));
  } catch {}
}

export async function removeFavourite(museumId: number): Promise<void> {
  try {
    const current = await getFavourites();
    const next = current.filter((id) => id !== museumId);
    await storage.setItem(MUSEUM_FAVOURITES_STORAGE_KEY, JSON.stringify(next));
  } catch {}
}
