/** Artwork data extracted by the classifier. */
export interface ClassifiedArtworkData {
  title: string;
  artist: string | null;
  period: string | null;
  technique: string | null;
  description: string;
  historicalContext: string | null;
  dimensions: string | null;
  currentLocation: string | null;
}

/** Museum data extracted by the classifier. */
export interface ClassifiedMuseumData {
  name: string;
  openingHours: Record<string, unknown> | null;
  admissionFees: Record<string, unknown> | null;
  website: string | null;
  collections: Record<string, unknown> | null;
  currentExhibitions: Record<string, unknown> | null;
  accessibility: Record<string, unknown> | null;
}

/** Result of classifying scraped content. */
export type ClassificationResult =
  | { type: 'artwork'; confidence: number; data: ClassifiedArtworkData }
  | { type: 'museum'; confidence: number; data: ClassifiedMuseumData }
  | { type: 'irrelevant'; confidence: number; data: null };

/** Port for LLM-based content classification. */
export interface ContentClassifierPort {
  /** Classifies scraped text content. Returns null on any LLM error. */
  classify(textContent: string, locale: string): Promise<ClassificationResult | null>;
}
