import type { Museum } from './museum.entity';
import type { CreateMuseumInput, UpdateMuseumInput } from './museum.types';

/** WGS84, ordered [minLng, minLat, maxLng, maxLat]. */
export type BoundingBox = [number, number, number, number];

export interface IMuseumRepository {
  create(input: CreateMuseumInput): Promise<Museum>;
  update(id: number, input: UpdateMuseumInput): Promise<Museum | null>;
  findById(id: number): Promise<Museum | null>;
  findBySlug(slug: string): Promise<Museum | null>;
  findAll(opts?: { activeOnly?: boolean }): Promise<Museum[]>;
  /** Active museums only. */
  findInBoundingBox(bbox: BoundingBox): Promise<Museum[]>;
  /**
   * W3 geofence-containment lookup (spec R8/R9). Returns the active museum
   * whose geofence polygon (or bbox fallback) contains the given coords, or
   * `null` if none matches. Used by `DetectMuseumUseCase` to short-circuit
   * the Haversine fallback with `confidence=1.0`.
   */
  findByCoords(lat: number, lng: number): Promise<Museum | null>;
  delete(id: number): Promise<void>;
}
