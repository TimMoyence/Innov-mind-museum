export interface NotableArtwork {
  title: string;
  artist?: string;
  museum?: string;
  sessionId: string;
  discussedAt: string;
}

/** GDPR data export. */
export interface UserMemoryExportData {
  preferredExpertise: string;
  favoritePeriods: string[];
  favoriteArtists: string[];
  museumsVisited: string[];
  totalArtworksDiscussed: number;
  notableArtworks: NotableArtwork[];
  interests: string[];
  summary: string | null;
  sessionCount: number;
  createdAt: string;
  updatedAt: string;
}
