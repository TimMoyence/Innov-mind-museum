import type { Museum } from './museum.entity';
import type { CreateMuseumInput, UpdateMuseumInput } from './museum.types';

export type BoundingBox = [number, number, number, number];

export interface IMuseumRepository {
  create(input: CreateMuseumInput): Promise<Museum>;
  update(id: number, input: UpdateMuseumInput): Promise<Museum | null>;
  findById(id: number): Promise<Museum | null>;
  findBySlug(slug: string): Promise<Museum | null>;
  findAll(opts?: { activeOnly?: boolean }): Promise<Museum[]>;
  findInBoundingBox(bbox: BoundingBox): Promise<Museum[]>;
  findByCoords(lat: number, lng: number): Promise<Museum | null>;
  delete(id: number): Promise<void>;
}
