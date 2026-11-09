export interface MuseumDetectionResult {
  museumId: number | null;
  confidence: number;
  distance: number | null;
  name: string | null;
}
