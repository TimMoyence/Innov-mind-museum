import type { Museum } from './museum.entity';
import type { CreateMuseumInput, UpdateMuseumInput } from './museum.types';

/** A geographic bounding box in WGS84 ordered as [minLng, minLat, maxLng, maxLat]. */
export type BoundingBox = [number, number, number, number];

/** Port for museum persistence operations. */
export interface IMuseumRepository {
  create(input: CreateMuseumInput): Promise<Museum>;
  update(id: number, input: UpdateMuseumInput): Promise<Museum | null>;
  findById(id: number): Promise<Museum | null>;
  findBySlug(slug: string): Promise<Museum | null>;
  findAll(opts?: { activeOnly?: boolean }): Promise<Museum[]>;
  /**
   * Returns active museums whose coordinates fall inside the given bounding box.
   * Used by the "search in this map area" feature to scope queries to the
   * visible viewport instead of a center+radius circle.
   */
  findInBoundingBox(bbox: BoundingBox): Promise<Museum[]>;
  delete(id: number): Promise<void>;
}
