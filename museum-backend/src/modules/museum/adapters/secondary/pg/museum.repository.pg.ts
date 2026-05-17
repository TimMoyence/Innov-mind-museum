import { Between } from 'typeorm';

import { Museum } from '@modules/museum/domain/museum/museum.entity';
import { withOptimisticLockRetry } from '@shared/db/optimistic-lock-retry';
import { conflict } from '@shared/errors/app.error';

import type {
  BoundingBox,
  IMuseumRepository,
} from '@modules/museum/domain/museum/museum.repository.interface';
import type {
  CreateMuseumInput,
  UpdateMuseumInput,
} from '@modules/museum/domain/museum/museum.types';
import type { DataSource, Repository } from 'typeorm';

export class MuseumRepositoryPg implements IMuseumRepository {
  private readonly repo: Repository<Museum>;

  constructor(dataSource: DataSource) {
    this.repo = dataSource.getRepository(Museum);
  }

  async create(input: CreateMuseumInput): Promise<Museum> {
    try {
      const entity = this.repo.create({
        name: input.name,
        slug: input.slug,
        address: input.address ?? null,
        description: input.description ?? null,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        config: input.config ?? {},
      });
      return await this.repo.save(entity);
    } catch (err: unknown) {
      if ((err as { code?: string }).code === '23505') {
        throw conflict('A museum with this slug already exists');
      }
      throw err;
    }
  }

  async update(id: number, input: UpdateMuseumInput): Promise<Museum | null> {
    const found = await this.findById(id);
    if (!found) return null;

    let entity: Museum = found;
    this.applyUpdates(entity, input);

    try {
      return await withOptimisticLockRetry({
        mutation: () => this.repo.save(entity),
        refetch: async () => {
          const fresh = await this.findById(id);
          if (fresh) {
            entity = fresh;
            this.applyUpdates(entity, input);
          }
        },
        context: `museum.update id=${id}`,
      });
    } catch (err: unknown) {
      if ((err as { code?: string }).code === '23505') {
        throw conflict('A museum with this slug already exists');
      }
      throw err;
    }
  }

  /** Mutates `entity`. */
  private applyUpdates(entity: Museum, input: UpdateMuseumInput): void {
    if (input.name !== undefined) entity.name = input.name;
    if (input.slug !== undefined) entity.slug = input.slug;
    if (input.address !== undefined) entity.address = input.address;
    if (input.description !== undefined) entity.description = input.description;
    if (input.latitude !== undefined) entity.latitude = input.latitude;
    if (input.longitude !== undefined) entity.longitude = input.longitude;
    if (input.config !== undefined) entity.config = input.config;
    if (input.isActive !== undefined) entity.isActive = input.isActive;
  }

  async findById(id: number): Promise<Museum | null> {
    return await this.repo.findOne({ where: { id } });
  }

  async findBySlug(slug: string): Promise<Museum | null> {
    return await this.repo.findOne({ where: { slug } });
  }

  async findAll(opts?: { activeOnly?: boolean }): Promise<Museum[]> {
    const where = opts?.activeOnly ? { isActive: true } : {};
    return await this.repo.find({
      where,
      order: { name: 'ASC' },
    });
  }

  /**
   * Simple BETWEEN filters on lat/lng — no PostGIS dependency. Antimeridian
   * crossing (minLng > maxLng) intentionally not supported.
   */
  async findInBoundingBox(bbox: BoundingBox): Promise<Museum[]> {
    const [minLng, minLat, maxLng, maxLat] = bbox;
    return await this.repo.find({
      where: {
        isActive: true,
        latitude: Between(minLat, maxLat),
        longitude: Between(minLng, maxLng),
      },
      order: { name: 'ASC' },
    });
  }

  async delete(id: number): Promise<void> {
    await this.repo.delete(id);
  }
}
