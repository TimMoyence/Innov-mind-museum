import { z } from 'zod';

const museumTypeSchema = z.enum(['art', 'history', 'science', 'specialized', 'general']);

export const createMuseumSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z.string().min(1).max(200),
  address: z.string().max(500).optional(),
  description: z.string().max(2000).optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  config: z.record(z.unknown()).optional(),
  museumType: museumTypeSchema.optional(),
});

export const updateMuseumSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  slug: z.string().min(1).max(200).optional(),
  address: z.string().max(500).nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  config: z.record(z.unknown()).optional(),
  isActive: z.boolean().optional(),
  museumType: museumTypeSchema.optional(),
});

export const searchMuseumsQuerySchema = z
  .object({
    lat: z.coerce.number().min(-90).max(90).optional(),
    lng: z.coerce.number().min(-180).max(180).optional(),
    radius: z.coerce.number().int().min(1000).max(50000).optional(),
    q: z.string().max(200).optional(),
  })
  .refine((data) => (data.lat == null) === (data.lng == null), {
    message: 'lat and lng must both be provided or both omitted',
  });
