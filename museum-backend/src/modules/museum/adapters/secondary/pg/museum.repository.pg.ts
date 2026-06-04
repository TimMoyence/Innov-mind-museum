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

/**
 * Cached at module level (set by `MuseumRepositoryPg.detectGeofenceMode()` on
 * first `findByCoords` call). Avoids `information_schema.columns` lookup on
 * every detect request. Module-level singleton is safe because the underlying
 * schema is immutable at runtime (migration-driven).
 */
type GeofenceMode = 'postgis' | 'jsonb-bbox' | 'absent';
let cachedGeofenceMode: GeofenceMode | null = null;

export class MuseumRepositoryPg implements IMuseumRepository {
  private readonly repo: Repository<Museum>;

  constructor(private readonly dataSource: DataSource) {
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

  /**
   * W3 geofence-containment lookup. Bootstrap-cached mode pick (introspects
   * `information_schema.columns` once at first call). Returns `null` if no
   * geofence column is present (e.g. migrations not yet run on this DB).
   */
  async findByCoords(lat: number, lng: number): Promise<Museum | null> {
    const mode = await this.detectGeofenceMode();

    if (mode === 'absent') return null;

    if (mode === 'postgis') {
      // ST_Contains uses the GIST index — sub-millisecond at V1 scale.
      const rows: { id: number }[] = await this.dataSource.query(
        `SELECT id FROM "museums"
         WHERE "is_active" = true
           AND "geofence" IS NOT NULL
           AND ST_Contains("geofence", ST_SetSRID(ST_Point($1, $2), 4326))
         LIMIT 1`,
        [lng, lat],
      );
      if (rows.length === 0) return null;
      return await this.findById(rows[0].id);
    }

    // jsonb-bbox path — load all museums with a bbox and filter in-app.
    // V1 caps at < 100 museums so the scan is cheap ; no GiST equivalent
    // for jsonb-stored rectangles without PostGIS.
    const rows: {
      id: number;
      geofence_bbox: { north: number; south: number; east: number; west: number } | null;
    }[] = await this.dataSource.query(
      `SELECT "id", "geofence_bbox" FROM "museums" WHERE "is_active" = true AND "geofence_bbox" IS NOT NULL`,
    );

    for (const row of rows) {
      const bbox = row.geofence_bbox;
      if (bbox && lat >= bbox.south && lat <= bbox.north && lng >= bbox.west && lng <= bbox.east) {
        return await this.findById(row.id);
      }
    }
    return null;
  }

  /**
   * One-shot column introspection — cached at module level so subsequent
   * detect calls don't hit `information_schema`. Returns `'absent'` when
   * neither column exists (defensive against partially-applied migrations).
   *
   * TD-42 — the cache is INTENTIONALLY boot-permanent, not TTL'd. In the prod
   * deploy model migrations run to completion BEFORE the app boots, so the
   * `museums` column set is fixed for the process lifetime; a TTL would re-hit
   * `information_schema` on the hot detect path for a runtime-schema-change
   * scenario that this deploy model never produces. The one case where the cache
   * must be cleared is tests that apply the geofence migration mid-suite — use
   * `_resetGeofenceModeCacheForTests()` (wired into the repo test `beforeEach`).
   */
  private async detectGeofenceMode(): Promise<GeofenceMode> {
    if (cachedGeofenceMode !== null) return cachedGeofenceMode;
    const cols: { column_name: string }[] = await this.dataSource.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'museums'
         AND column_name IN ('geofence', 'geofence_bbox')`,
    );
    const colSet = new Set(cols.map((row) => row.column_name));
    if (colSet.has('geofence')) cachedGeofenceMode = 'postgis';
    else if (colSet.has('geofence_bbox')) cachedGeofenceMode = 'jsonb-bbox';
    else cachedGeofenceMode = 'absent';
    return cachedGeofenceMode;
  }
}

/** Test seam — clears the bootstrap-cached geofence mode. Do NOT use in prod. */
export function _resetGeofenceModeCacheForTests(): void {
  cachedGeofenceMode = null;
}
