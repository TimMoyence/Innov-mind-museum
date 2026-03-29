import { conflict } from '@shared/errors/app.error';

import { Museum } from '../../core/domain/museum.entity';

import type { IMuseumRepository } from '../../core/domain/museum.repository.interface';
import type { CreateMuseumInput, UpdateMuseumInput } from '../../core/domain/museum.types';
import type { DataSource, Repository } from 'typeorm';

/** TypeORM implementation of the museum repository. */
export class MuseumRepositoryPg implements IMuseumRepository {
  private readonly repo: Repository<Museum>;

  constructor(dataSource: DataSource) {
    this.repo = dataSource.getRepository(Museum);
  }

  /** Inserts a new museum row and returns the persisted record. */
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

  /** Dynamically updates museum fields and returns the updated record. */
  async update(id: number, input: UpdateMuseumInput): Promise<Museum | null> {
    const existing = await this.findById(id);
    if (!existing) return null;

    if (input.name !== undefined) existing.name = input.name;
    if (input.slug !== undefined) existing.slug = input.slug;
    if (input.address !== undefined) existing.address = input.address;
    if (input.description !== undefined) existing.description = input.description;
    if (input.latitude !== undefined) existing.latitude = input.latitude;
    if (input.longitude !== undefined) existing.longitude = input.longitude;
    if (input.config !== undefined) existing.config = input.config;
    if (input.isActive !== undefined) existing.isActive = input.isActive;

    try {
      return await this.repo.save(existing);
    } catch (err: unknown) {
      if ((err as { code?: string }).code === '23505') {
        throw conflict('A museum with this slug already exists');
      }
      throw err;
    }
  }

  /** Finds a museum by its numeric ID. */
  async findById(id: number): Promise<Museum | null> {
    return await this.repo.findOne({ where: { id } });
  }

  /** Finds a museum by its URL-friendly slug. */
  async findBySlug(slug: string): Promise<Museum | null> {
    return await this.repo.findOne({ where: { slug } });
  }

  /** Lists all museums, optionally filtering to active-only. */
  async findAll(opts?: { activeOnly?: boolean }): Promise<Museum[]> {
    const where = opts?.activeOnly ? { isActive: true } : {};
    return await this.repo.find({
      where,
      order: { name: 'ASC' },
    });
  }

  /** Permanently deletes a museum by its numeric ID. */
  async delete(id: number): Promise<void> {
    await this.repo.delete(id);
  }
}
