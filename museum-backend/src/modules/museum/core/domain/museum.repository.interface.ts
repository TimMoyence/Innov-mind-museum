import type { Museum } from './museum.entity';
import type { CreateMuseumInput, UpdateMuseumInput } from './museum.types';

/** Port for museum persistence operations. */
export interface IMuseumRepository {
  create(input: CreateMuseumInput): Promise<Museum>;
  update(id: number, input: UpdateMuseumInput): Promise<Museum | null>;
  findById(id: number): Promise<Museum | null>;
  findBySlug(slug: string): Promise<Museum | null>;
  findAll(opts?: { activeOnly?: boolean }): Promise<Museum[]>;
  delete(id: number): Promise<void>;
}
