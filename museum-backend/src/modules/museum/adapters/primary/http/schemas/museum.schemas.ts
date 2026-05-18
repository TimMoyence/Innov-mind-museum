import { z } from 'zod';

const museumTypeSchema = z.enum(['art', 'history', 'science', 'specialized', 'general']);

export const createMuseumSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z.string().min(1).max(200),
  address: z.string().max(500).optional(),
  description: z.string().max(2000).optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  museumType: museumTypeSchema.optional(),
});

export const updateMuseumSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  slug: z.string().min(1).max(200).optional(),
  address: z.string().max(500).nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  isActive: z.boolean().optional(),
  museumType: museumTypeSchema.optional(),
});

/**
 * bbox format: "minLng,minLat,maxLng,maxLat" (WGS84). Mutually exclusive with
 * lat/lng/radius — when bbox is supplied, the use case queries inside the
 * rectangle. Anchored + bounded (exactly 4 comma-separated decimals), no
 * ReDoS surface.
 */
// eslint-disable-next-line security/detect-unsafe-regex -- anchored + bounded, no catastrophic backtracking
const BBOX_REGEX = /^-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?$/;

export const getEnrichmentQuerySchema = z.object({
  locale: z.string().min(2).max(10),
});

export const getEnrichmentStatusQuerySchema = z.object({
  locale: z.string().min(2).max(10),
  jobId: z.string().min(1).max(128),
});

/**
 * W3 — GET /api/museums/detect-museum query schema. Both lat/lng are
 * REQUIRED (spec R5). `z.coerce` turns the string query param into a number
 * up-front so the range refinements (-90..90, -180..180) fire on parse.
 */
export const detectMuseumQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});

export const searchMuseumsQuerySchema = z
  .object({
    lat: z.coerce.number().min(-90).max(90).optional(),
    lng: z.coerce.number().min(-180).max(180).optional(),
    radius: z.coerce.number().int().min(1000).max(50000).optional(),
    q: z.string().max(200).optional(),
    bbox: z.string().regex(BBOX_REGEX, 'bbox must be "minLng,minLat,maxLng,maxLat"').optional(),
  })
  .refine((data) => (data.lat == null) === (data.lng == null), {
    message: 'lat and lng must both be provided or both omitted',
  })
  .refine(
    (data) => {
      if (!data.bbox) return true;
      const parts = data.bbox.split(',').map(Number);
      const [minLng, minLat, maxLng, maxLat] = parts;
      return (
        minLng >= -180 &&
        maxLng <= 180 &&
        minLat >= -90 &&
        maxLat <= 90 &&
        minLng < maxLng &&
        minLat < maxLat
      );
    },
    { message: 'bbox values out of range or not in min<max order' },
  );
