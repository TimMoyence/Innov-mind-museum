/**
 * T6.1 — Zod schemas for `POST /chat/compare`.
 *
 * Locks down the wire contract for the visual-similarity compare endpoint
 * (spec R6/R17/R18, design.md §5):
 *   - `compareRequestSchema` validates the multipart body fields. The image
 *     bytes themselves arrive via `multer.single('image')` (not via the body
 *     schema) and rejection of bad images (mime, magic, oversize) is enforced
 *     at the multer layer + the existing `ImageProcessingService` (R12). The
 *     body schema therefore intentionally does NOT declare an `image` field.
 *   - `compareResponseSchema` validates the {@link CompareResult} envelope
 *     returned in the 200 response (matches + durationMs + modelVersion +
 *     optional fallbackReason).
 *
 * The schemas mirror the domain types in `compare-result.types.ts` and the
 * use-case input shape in `compare.use-case.ts`. Keep them in sync when
 * editing.
 */
import { z } from 'zod';

import type { FallbackReason } from '@modules/chat/domain/visual-similarity/compare-result.types';

// ---------------------------------------------------------------------------
// Request — body schema
// ---------------------------------------------------------------------------

/**
 * Wikidata QID regex: `Q` followed by a positive integer (no leading zeros).
 *
 * Matches the design.md §5 constraint and the existing Wikidata tooling on
 * the chat module (`wikidata.client.ts`). The `[1-9]\d*` shape rejects the
 * placeholder `Q0` value used for "absent QID" elsewhere in the catalog.
 */
const WIKIDATA_QID_REGEX = /^Q[1-9]\d*$/;

/** Upper bound on museum-scope filter list — keeps the kNN payload small. */
const MAX_MUSEUM_QIDS = 20;

/** Default `topK` (R17) when the field is omitted on the request body. */
const DEFAULT_TOP_K = 5;

/**
 * Body schema for `POST /chat/compare`.
 *
 * Fields:
 *  - `sessionId` — UUID v4 of the chat session the assistant turn threads into.
 *  - `topK` — integer in `[1, 10]`. Optional; defaults to 5 (R17). Coerced
 *     from string so multipart form-data submissions (where every field is a
 *     string) round-trip cleanly.
 *  - `locale` — `'fr' | 'en'`. Optional — when omitted the route resolves it
 *     from the `Accept-Language` header.
 *  - `museumQids` — optional array of Wikidata QIDs (max 20) used to scope
 *     the kNN search to a single museum's catalog (R4).
 *
 * Unknown fields are silently stripped (Zod default behaviour) — the body
 * schema is not `.strict()` so the route accepts forward-compatible additions
 * without breaking older clients.
 */
export const compareRequestSchema = z.object({
  sessionId: z.string().uuid(),
  topK: z.coerce
    .number()
    .int()
    .min(1)
    .max(10)
    .optional()
    .default(DEFAULT_TOP_K),
  locale: z.enum(['fr', 'en']).optional(),
  museumQids: z
    .array(z.string().regex(WIKIDATA_QID_REGEX))
    .max(MAX_MUSEUM_QIDS)
    .optional(),
});

/** Inferred TS type for the parsed `POST /chat/compare` request body. */
export type CompareRequest = z.infer<typeof compareRequestSchema>;

// ---------------------------------------------------------------------------
// Response — body schema
// ---------------------------------------------------------------------------

/**
 * `FallbackReason` literal union mirrored from the domain type.
 *
 * Centralised here so `compareResponseSchema` accepts exactly the same set
 * the use-case may emit. Listed manually (rather than `z.enum(...)` from a
 * runtime constant) because the domain type is purely structural — keep this
 * list in sync with `compare-result.types.ts`.
 */
const FALLBACK_REASONS = [
  'no_visual_neighbor',
  'encoder_unavailable',
  'quota_exceeded',
] as const satisfies readonly FallbackReason[];

const fallbackReasonSchema = z.enum(FALLBACK_REASONS);

/**
 * `ArtworkFacts` schema mirrored from the knowledge-base port. Only `qid` and
 * `title` are required; all other fields are optional (sparse Wikidata
 * results). Kept here rather than in `chat-session.schemas.ts` to avoid
 * coupling visual-similarity to the chat-session vertical.
 */
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

/**
 * `CompareMatch` schema mirrored from `compare-result.types.ts`.
 *
 * Structural mirror — keep in sync with the domain type. Field-level
 * constraints (e.g. score range `[0, 1]`) are enforced upstream by the
 * scoring service; the response schema validates shape only so the route
 * never reshapes the use-case output.
 */
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

/**
 * Schema for the 200 response body of `POST /chat/compare`.
 *
 * Mirrors the {@link CompareResult} envelope. `fallbackReason` is optional
 * and constrained to the literal union — an unknown literal (e.g. typo from
 * the use-case) is rejected so the wire contract stays auditable.
 */
export const compareResponseSchema = z.object({
  matches: z.array(compareMatchSchema),
  durationMs: z.number(),
  modelVersion: z.string(),
  fallbackReason: fallbackReasonSchema.optional(),
});

/** Inferred TS type for the parsed `POST /chat/compare` 200 response body. */
export type CompareResponseDTO = z.infer<typeof compareResponseSchema>;
