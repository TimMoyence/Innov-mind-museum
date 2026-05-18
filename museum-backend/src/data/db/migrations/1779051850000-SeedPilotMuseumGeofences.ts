import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * W3 (geo + walk + intra-musée) — backfills approximate geofence polygons
 * for the 3 Bordeaux pilot museums (test weekend 2026-05-23/24). The
 * migration introspects which storage mode was activated by
 * AddMuseumGeofence:
 *
 *   - `geofence geometry(Polygon, 4326)` → `ST_GeomFromText` insert.
 *   - `geofence_bbox jsonb`              → `{north, south, east, west}` insert.
 *
 * Slugs match `museum-backend/scripts/seed-museums.ts`. Coords sourced from
 * the same seed file (verified 2026-05-18). Each pilot slug is checked for
 * existence first ; missing rows are skipped (slug not yet seeded → run
 * `pnpm seed:museums` first, then re-run this migration).
 *
 * Polygon corners are ~±110m squares (lat ±0.0010°, lng ±0.0014° at 44.85°N)
 * centered on each museum, sized to cover the building + immediate visitor
 * approach zone. Refine post-pilot with on-site curator input.
 *
 * Reversibility: `down()` blanks the geofence column on the 3 pilot rows.
 * Safe even on partial seeds (no rows changed if slugs were absent).
 */

interface PilotGeofence {
  slug: string;
  /**
   * Polygon corners (NW, NE, SE, SW) — explicit ring, CLOSED via repeated
   * first point on emit (PostGIS POLYGON spec). All coords WGS84.
   */
  corners: { lat: number; lng: number }[];
}

const PILOT_GEOFENCES: PilotGeofence[] = [
  {
    // Musée d'Aquitaine — 20 Cours Pasteur, 33000 Bordeaux (44.8346, -0.5745)
    slug: 'musee-d-aquitaine',
    corners: [
      { lat: 44.8356, lng: -0.5759 },
      { lat: 44.8356, lng: -0.5731 },
      { lat: 44.8336, lng: -0.5731 },
      { lat: 44.8336, lng: -0.5759 },
    ],
  },
  {
    // CAPC Musée d'art contemporain — 7 Rue Ferrère, 33000 Bordeaux (44.8497, -0.5714)
    slug: 'capc-musee-d-art-contemporain',
    corners: [
      { lat: 44.8507, lng: -0.5728 },
      { lat: 44.8507, lng: -0.57 },
      { lat: 44.8487, lng: -0.57 },
      { lat: 44.8487, lng: -0.5728 },
    ],
  },
  {
    // La Cité du Vin — 134 Quai de Bacalan, 33300 Bordeaux (44.8625, -0.5502)
    slug: 'la-cite-du-vin',
    corners: [
      { lat: 44.8635, lng: -0.5516 },
      { lat: 44.8635, lng: -0.5488 },
      { lat: 44.8615, lng: -0.5488 },
      { lat: 44.8615, lng: -0.5516 },
    ],
  },
];

function buildPolygonWkt(corners: { lat: number; lng: number }[]): string {
  const ring = corners
    .concat(corners[0]) // close the ring (first == last per WKT spec)
    .map(({ lat, lng }) => `${lng} ${lat}`)
    .join(', ');
  return `POLYGON((${ring}))`;
}

function buildBbox(corners: { lat: number; lng: number }[]): {
  north: number;
  south: number;
  east: number;
  west: number;
} {
  const lats = corners.map((c) => c.lat);
  const lngs = corners.map((c) => c.lng);
  return {
    north: Math.max(...lats),
    south: Math.min(...lats),
    east: Math.max(...lngs),
    west: Math.min(...lngs),
  };
}

export class SeedPilotMuseumGeofences1779051850000 implements MigrationInterface {
  name = 'SeedPilotMuseumGeofences1779051850000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const cols = (await queryRunner.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'museums' AND column_name IN ('geofence', 'geofence_bbox')`,
    )) as { column_name: string }[];
    const colSet = new Set(cols.map((row) => row.column_name));

    if (!colSet.has('geofence') && !colSet.has('geofence_bbox')) {
      console.warn(
        'SeedPilotMuseumGeofences: neither `geofence` nor `geofence_bbox` column found; skipping seed',
      );
      return;
    }

    for (const pilot of PILOT_GEOFENCES) {
      const existing = (await queryRunner.query(
        `SELECT id FROM "museums" WHERE "slug" = $1 LIMIT 1`,
        [pilot.slug],
      )) as { id: number }[];

      if (existing.length === 0) {
        console.warn(
          `SeedPilotMuseumGeofences: slug "${pilot.slug}" not found in museums; skipping`,
        );
        continue;
      }

      if (colSet.has('geofence')) {
        const wkt = buildPolygonWkt(pilot.corners);
        await queryRunner.query(
          `UPDATE "museums" SET "geofence" = ST_GeomFromText($1, 4326) WHERE "slug" = $2`,
          [wkt, pilot.slug],
        );
      } else {
        const bbox = buildBbox(pilot.corners);
        await queryRunner.query(
          `UPDATE "museums" SET "geofence_bbox" = $1::jsonb WHERE "slug" = $2`,
          [JSON.stringify(bbox), pilot.slug],
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const cols = (await queryRunner.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'museums' AND column_name IN ('geofence', 'geofence_bbox')`,
    )) as { column_name: string }[];
    const colSet = new Set(cols.map((row) => row.column_name));

    const slugs = PILOT_GEOFENCES.map((p) => p.slug);

    if (colSet.has('geofence')) {
      await queryRunner.query(`UPDATE "museums" SET "geofence" = NULL WHERE "slug" = ANY($1)`, [
        slugs,
      ]);
    }
    if (colSet.has('geofence_bbox')) {
      await queryRunner.query(
        `UPDATE "museums" SET "geofence_bbox" = NULL WHERE "slug" = ANY($1)`,
        [slugs],
      );
    }
  }
}
