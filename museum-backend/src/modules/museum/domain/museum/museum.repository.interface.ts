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
  delete(id: number): Promise<void>;
}
