import pool from '@data/db';
import { conflict } from '@shared/errors/app.error';

import type { Museum } from '../../core/domain/museum.entity';
import type { IMuseumRepository } from '../../core/domain/museum.repository.interface';
import type { CreateMuseumInput, UpdateMuseumInput } from '../../core/domain/museum.types';

/** PostgreSQL implementation of the museum repository. */
export class MuseumRepositoryPg implements IMuseumRepository {
  /** Inserts a new museum row and returns the persisted record. */
  async create(input: CreateMuseumInput): Promise<Museum> {
    try {
      const result = await pool.query(
        `INSERT INTO "museums" (name, slug, address, description, latitude, longitude, config)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          input.name,
          input.slug,
          input.address ?? null,
          input.description ?? null,
          input.latitude ?? null,
          input.longitude ?? null,
          JSON.stringify(input.config ?? {}),
        ],
      );
      return result.rows[0];
    } catch (err: unknown) {
      if ((err as { code?: string }).code === '23505') {
        throw conflict('A museum with this slug already exists');
      }
      throw err;
    }
  }

  /** Dynamically updates museum fields and returns the updated record. */
  async update(id: number, input: UpdateMuseumInput): Promise<Museum | null> {
    const sets: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (input.name !== undefined) {
      sets.push(`name = $${idx++}`);
      values.push(input.name);
    }
    if (input.slug !== undefined) {
      sets.push(`slug = $${idx++}`);
      values.push(input.slug);
    }
    if (input.address !== undefined) {
      sets.push(`address = $${idx++}`);
      values.push(input.address);
    }
    if (input.description !== undefined) {
      sets.push(`description = $${idx++}`);
      values.push(input.description);
    }
    if (input.latitude !== undefined) {
      sets.push(`latitude = $${idx++}`);
      values.push(input.latitude);
    }
    if (input.longitude !== undefined) {
      sets.push(`longitude = $${idx++}`);
      values.push(input.longitude);
    }
    if (input.config !== undefined) {
      sets.push(`config = $${idx++}`);
      values.push(JSON.stringify(input.config));
    }
    if (input.isActive !== undefined) {
      sets.push(`is_active = $${idx++}`);
      values.push(input.isActive);
    }

    if (sets.length === 0) return await this.findById(id);

    sets.push(`updated_at = NOW()`);
    values.push(id);

    try {
      const result = await pool.query(
        `UPDATE "museums" SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
        values,
      );
      return result.rows[0] ?? null;
    } catch (err: unknown) {
      if ((err as { code?: string }).code === '23505') {
        throw conflict('A museum with this slug already exists');
      }
      throw err;
    }
  }

  /** Finds a museum by its numeric ID. */
  async findById(id: number): Promise<Museum | null> {
    const result = await pool.query(`SELECT * FROM "museums" WHERE id = $1`, [id]);
    return result.rows[0] ?? null;
  }

  /** Finds a museum by its URL-friendly slug. */
  async findBySlug(slug: string): Promise<Museum | null> {
    const result = await pool.query(`SELECT * FROM "museums" WHERE slug = $1`, [slug]);
    return result.rows[0] ?? null;
  }

  /** Lists all museums, optionally filtering to active-only. */
  async findAll(opts?: { activeOnly?: boolean }): Promise<Museum[]> {
    const where = opts?.activeOnly ? `WHERE is_active = true` : '';
    const result = await pool.query(`SELECT * FROM "museums" ${where} ORDER BY name ASC`);
    return result.rows;
  }

  /** Permanently deletes a museum by its numeric ID. */
  async delete(id: number): Promise<void> {
    await pool.query(`DELETE FROM "museums" WHERE id = $1`, [id]);
  }
}
