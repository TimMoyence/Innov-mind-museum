import { httpRequest } from '@/shared/api/httpRequest';

export interface DailyArtwork {
  title: string;
  artist: string;
  year: string;
  imageUrl: string;
  description: string;
  funFact: string;
  museum: string;
}

/** Fetches the daily artwork from the backend. */
export const fetchDailyArt = (): Promise<DailyArtwork> =>
  httpRequest<DailyArtwork>('/api/daily-art');
