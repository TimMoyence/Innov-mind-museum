import { z } from 'zod';

import type { FallbackReason } from '@modules/chat/domain/visual-similarity/compare-result.types';

const WIKIDATA_QID_REGEX = /^Q[1-9]\d*$/;

const MAX_MUSEUM_QIDS = 20;

const DEFAULT_TOP_K = 5;

export const compareRequestSchema = z.object({
  sessionId: z.uuid(),
  topK: z.coerce.number().int().min(1).max(10).optional().default(DEFAULT_TOP_K),
  locale: z.enum(['fr', 'en']).optional(),
  museumQids: z.array(z.string().regex(WIKIDATA_QID_REGEX)).max(MAX_MUSEUM_QIDS).optional(),
});

export type CompareRequest = z.infer<typeof compareRequestSchema>;

const FALLBACK_REASONS = [
  'no_visual_neighbor',
  'encoder_unavailable',
  'quota_exceeded',
] as const satisfies readonly FallbackReason[];

const fallbackReasonSchema = z.enum(FALLBACK_REASONS);

const artworkFactsSchema = z.object({
  qid: z.string(),
  title: z.string(),
  artist: z.string().optional(),
  date: z.string().optional(),
  technique: z.string().optional(),
  collection: z.string().optional(),
  movement: z.string().optional(),
  genre: z.string().optional(),
  imageUrl: z.string().optional(),
  aliases: z.array(z.string()).optional(),
});

const compareMatchSchema = z.object({
  qid: z.string(),
  title: z.string(),
  imageUrl: z.string(),
  thumbnailUrl: z.string().optional(),
  visualScore: z.number(),
  metadataScore: z.number(),
  finalScore: z.number(),
  rationale: z.string(),
  facts: artworkFactsSchema,
  attribution: z.string().optional(),
});

export const compareResponseSchema = z.object({
  matches: z.array(compareMatchSchema),
  durationMs: z.number(),
  modelVersion: z.string(),
  fallbackReason: fallbackReasonSchema.optional(),
});

export type CompareResponseDTO = z.infer<typeof compareResponseSchema>;
