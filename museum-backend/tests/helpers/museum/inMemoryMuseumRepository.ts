import { Museum } from '@modules/museum/core/domain/museum.entity';
import type { IMuseumRepository } from '@modules/museum/core/domain/museum.repository.interface';
import type {
  CreateMuseumInput,
  UpdateMuseumInput,
} from '@modules/museum/core/domain/museum.types';

/** In-memory implementation of IMuseumRepository for unit tests. */
export class InMemoryMuseumRepository implements IMuseumRepository {
  private museums: Museum[] = [];
  private nextId = 1;

  async create(input: CreateMuseumInput): Promise<Museum> {
    const museum = new Museum();
    museum.id = this.nextId++;
    museum.name = input.name;
    museum.slug = input.slug;
    museum.address = input.address ?? null;
    museum.description = input.description ?? null;
    museum.latitude = input.latitude ?? null;
    museum.longitude = input.longitude ?? null;
    museum.config = input.config ?? {};
    museum.isActive = true;
    museum.createdAt = new Date();
    museum.updatedAt = new Date();
    this.museums.push(museum);
    return museum;
  }

  async update(id: number, input: UpdateMuseumInput): Promise<Museum | null> {
    const museum = this.museums.find((m) => m.id === id);
    if (!museum) return null;

    if (input.name !== undefined) museum.name = input.name;
    if (input.slug !== undefined) museum.slug = input.slug;
    if (input.address !== undefined) museum.address = input.address;
    if (input.description !== undefined) museum.description = input.description;
    if (input.latitude !== undefined) museum.latitude = input.latitude;
    if (input.longitude !== undefined) museum.longitude = input.longitude;
    if (input.config !== undefined) museum.config = input.config;
    if (input.isActive !== undefined) museum.isActive = input.isActive;
    museum.updatedAt = new Date();

    return museum;
  }

  async findById(id: number): Promise<Museum | null> {
    return this.museums.find((m) => m.id === id) ?? null;
  }

  async findBySlug(slug: string): Promise<Museum | null> {
    return this.museums.find((m) => m.slug === slug) ?? null;
  }

  async findAll(opts?: { activeOnly?: boolean }): Promise<Museum[]> {
    if (opts?.activeOnly) {
      return this.museums.filter((m) => m.isActive);
    }
    return [...this.museums];
  }

  async delete(id: number): Promise<void> {
    this.museums = this.museums.filter((m) => m.id !== id);
  }

  /** Test helper: reset all stored museums. */
  clear(): void {
    this.museums = [];
    this.nextId = 1;
  }

  /** Test helper: get raw internal state. */
  getAll(): Museum[] {
    return [...this.museums];
  }
}
