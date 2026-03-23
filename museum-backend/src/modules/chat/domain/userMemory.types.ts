/** An artwork that was notably discussed across sessions. */
export interface NotableArtwork {
  title: string;
  artist?: string;
  museum?: string;
  sessionId: string;
  discussedAt: string;
}

/** Shape used for GDPR data export of user memory. */
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
