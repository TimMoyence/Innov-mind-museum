import { z } from 'zod';

export const createMuseumSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z.string().min(1).max(200),
  address: z.string().max(500).optional(),
  description: z.string().max(2000).optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  config: z.record(z.unknown()).optional(),
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
});

export const searchMuseumsQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radius: z.coerce.number().int().min(1000).max(50000).optional(),
  q: z.string().max(100).optional(),
});
