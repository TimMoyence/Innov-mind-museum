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
export const fetchDailyArt = async (): Promise<DailyArtwork> => {
  const data = await httpRequest<{ artwork: DailyArtwork }>('/api/daily-art');
  return data.artwork;
};
