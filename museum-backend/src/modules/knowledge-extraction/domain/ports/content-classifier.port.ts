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

export interface ClassifiedMuseumData {
  name: string;
  openingHours: Record<string, unknown> | null;
  admissionFees: Record<string, unknown> | null;
  website: string | null;
  collections: Record<string, unknown> | null;
  currentExhibitions: Record<string, unknown> | null;
  accessibility: Record<string, unknown> | null;
}

export type ClassificationResult =
  | { type: 'artwork'; confidence: number; data: ClassifiedArtworkData }
  | { type: 'museum'; confidence: number; data: ClassifiedMuseumData }
  | { type: 'irrelevant'; confidence: number; data: null };

export interface ContentClassifierPort {
  /** Returns null on any LLM error. */
  classify(textContent: string, locale: string): Promise<ClassificationResult | null>;
}
