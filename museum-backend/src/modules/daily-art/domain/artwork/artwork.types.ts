/**
 * Daily-art domain types.
 */

/** Shape of a curated artwork entry. */
export interface Artwork {
  title: string;
  artist: string;
  year: string;
  imageUrl: string;
  description: string;
  funFact: string;
  museum: string;
}
