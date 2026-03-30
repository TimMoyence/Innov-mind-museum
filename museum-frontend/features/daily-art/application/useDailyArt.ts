import { useCallback, useEffect, useState } from 'react';

import { storage } from '@/shared/infrastructure/storage';
import { fetchDailyArt, type DailyArtwork } from '../infrastructure/dailyArtApi';

const SAVED_ARTWORKS_KEY = '@musaium/saved_artworks';
const DISMISSED_KEY = '@musaium/daily_art_dismissed';

const todayKey = (): string => new Date().toISOString().slice(0, 10);

/** Hook that fetches the daily artwork, tracks save/skip state, and handles dismissal for the day. */
export const useDailyArt = () => {
  const [artwork, setArtwork] = useState<DailyArtwork | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaved, setIsSaved] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      // Check if already dismissed today
      const dismissedDate = await storage.getItem(DISMISSED_KEY);
      if (dismissedDate === todayKey()) {
        setDismissed(true);
        setIsLoading(false);
        return;
      }

      try {
        const data = await fetchDailyArt();
        if (cancelled) return;
        setArtwork(data);

        // Check if already saved
        const saved = await storage.getJSON<DailyArtwork[]>(SAVED_ARTWORKS_KEY);
        if (saved?.some((a) => a.title === data.title && a.artist === data.artist)) {
          setIsSaved(true);
        }
      } catch {
        // Silently fail — daily art is non-critical
        if (!cancelled) setArtwork(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const save = useCallback(async () => {
    if (!artwork) return;
    const existing = (await storage.getJSON<DailyArtwork[]>(SAVED_ARTWORKS_KEY)) ?? [];
    const alreadySaved = existing.some(
      (a) => a.title === artwork.title && a.artist === artwork.artist,
    );
    if (!alreadySaved) {
      existing.push(artwork);
      await storage.setJSON(SAVED_ARTWORKS_KEY, existing);
    }
    setIsSaved(true);
  }, [artwork]);

  const skip = useCallback(async () => {
    await storage.setItem(DISMISSED_KEY, todayKey());
    setDismissed(true);
  }, []);

  return { artwork, isLoading, isSaved, dismissed, save, skip };
};
