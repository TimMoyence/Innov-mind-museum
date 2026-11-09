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
        ...(input.museumType ? { museumType: input.museumType } : {}),
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

  private applyUpdates(entity: Museum, input: UpdateMuseumInput): void {
    if (input.name !== undefined) entity.name = input.name;
    if (input.slug !== undefined) entity.slug = input.slug;
    if (input.address !== undefined) entity.address = input.address;
    if (input.description !== undefined) entity.description = input.description;
    if (input.latitude !== undefined) entity.latitude = input.latitude;
    if (input.longitude !== undefined) entity.longitude = input.longitude;
    if (input.config !== undefined) entity.config = input.config;
    if (input.isActive !== undefined) entity.isActive = input.isActive;
    if (input.museumType !== undefined) entity.museumType = input.museumType;
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

  async findByCoords(lat: number, lng: number): Promise<Museum | null> {
    const mode = await this.detectGeofenceMode();

    if (mode === 'absent') return null;

    if (mode === 'postgis') {
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

export function _resetGeofenceModeCacheForTests(): void {
  cachedGeofenceMode = null;
}
