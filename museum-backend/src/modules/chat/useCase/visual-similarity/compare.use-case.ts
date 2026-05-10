/**
 * T5.4 — `compareImageUseCase` orchestration wrapper for `POST /chat/compare`.
 *
 * Composes three collaborators around a single user-supplied image:
 *
 *   1. {@link ImageProcessorPort.process} — re-uses the existing chat image
 *      pre-processing pipeline (EXIF strip, magic-byte check, MIME validation,
 *      OCR injection guardrail). R12 explicitly forbids duplicating any of
 *      that logic here — we ALWAYS go through the shared processor.
 *   2. {@link SimilarityServicePort.compare} — the T5.3
 *      {@link import('./similarity.service').VisualSimilarityService} pipeline
 *      (cache → encode → kNN → enrich → score+fuse → top-K).
 *   3. {@link ChatPersistencePort.appendAssistantMessage} — persists the
 *      assistant turn carrying the {@link CompareResult} so the conversation
 *      audit trail (R1) and downstream FE rendering both have a stable record,
 *      including empty-result fallbacks (R10 — Q7 empty UX needs the
 *      `fallbackReason` to surface).
 *
 * Failure semantics (locked by `compare.use-case.test.ts`):
 *
 *   - `imageProcessor.process` throws → propagate; do NOT call
 *     `similarityService.compare`, do NOT persist anything (the user message
 *     was rejected pre-pipeline, so no assistant turn exists).
 *   - `similarityService.compare` returns
 *     `{ matches: [], fallbackReason: 'encoder_unavailable' }` → R11. The
 *     route maps this to a 503 and the audit trail must NOT contain a phantom
 *     assistant turn for an outage. Return the result WITHOUT persisting.
 *   - `similarityService.compare` returns `{ matches: [], fallbackReason }`
 *     for ANY OTHER reason (`no_visual_neighbor`, `quota_exceeded`) → STILL
 *     persist an assistant message carrying the `fallbackReason` so the FE
 *     can render the empty-result UX (R10) and the audit log retains the trace.
 *
 * Wiring boundary: this file declares **structural ports** for each
 * dependency. The composition root (Phase 5.5 / Phase 6) is responsible for
 * adapting the production `ChatService` / `ImageProcessingService` /
 * `VisualSimilarityService` to these ports. We do NOT import `ChatService`
 * directly — it would couple the use-case to the wider chat module surface
 * (PostMessageInput shape, message authoring rules, …) and forbid editing
 * `chat.service.ts` from this T5.4 task.
 */

import type { CompareResult } from '@modules/chat/domain/visual-similarity/compare-result.types';

/**
 * Supported MIME types for the compare pipeline. Mirrors the EmbeddingsPort
 * contract — kept narrow so the structural ports below stay aligned with the
 * downstream `VisualSimilarityService.compare` signature.
 */
export type CompareMimeType = 'image/jpeg' | 'image/png' | 'image/webp';

/**
 * Minimal structural port for the image processing pipeline.
 *
 * Adapted at the composition root from the existing
 * {@link import('@modules/chat/useCase/image/image-processing.service').ImageProcessingService}
 * (R12: no duplicated EXIF / magic / MIME / OCR logic here). The adapter is
 * trivial — it forwards the buffer + mimeType to `processImage` (after
 * wrapping the buffer in a base64 `upload` payload) and returns the cleaned
 * buffer + cleaned MIME for the similarity service to consume.
 */
export interface ImageProcessorPort {
  /**
   * Sanitise + validate the user-supplied image. Implementations MUST throw
   * on any of: invalid magic bytes, disallowed MIME, oversize after strip,
   * OCR injection. Successful resolution returns the cleaned buffer and the
   * (possibly transcoded) MIME type ready for embedding.
   */
  process(input: {
    sessionId: string;
    buffer: Buffer;
    mimeType: CompareMimeType;
    ownerId?: number;
  }): Promise<{ buffer: Buffer; mimeType: CompareMimeType }>;
}

/**
 * Minimal structural port for the visual-similarity pipeline.
 *
 * Adapted at the composition root from the T5.3
 * {@link import('./similarity.service').VisualSimilarityService}.
 */
export interface SimilarityServicePort {
  compare(input: {
    buffer: Buffer;
    mimeType: CompareMimeType;
    topK: number;
    locale: 'fr' | 'en';
    museumQids?: string[];
  }): Promise<CompareResult>;
}

/**
 * Minimal structural port for assistant-message persistence.
 *
 * Adapted at the composition root from the production `ChatService`. We
 * accept a small surface so this use-case is independent of the wider chat
 * module (and so the test suite can mock it without rebuilding the whole
 * `ChatService` graph).
 */
export interface ChatPersistencePort {
  appendAssistantMessage(input: {
    sessionId: string;
    text?: string;
    metadata?: Record<string, unknown>;
  }): Promise<{ id: string }>;
}

/** Constructor dependencies for {@link compareImageUseCase}. */
export interface CompareUseCaseDeps {
  imageProcessor: ImageProcessorPort;
  similarityService: SimilarityServicePort;
  chatService: ChatPersistencePort;
}

/** Single-call input payload accepted by the compare use-case. */
export interface CompareUseCaseInput {
  /** Chat session id — threads the assistant turn into the conversation. */
  sessionId: string;
  /** Raw user-supplied image bytes (BEFORE any sanitisation). */
  buffer: Buffer;
  /** Declared MIME type (validated by the image processor). */
  mimeType: CompareMimeType;
  /** Number of matches to return after fusion + truncation. */
  topK: number;
  /** Resolved locale for rationale + Wikidata enrichment. */
  locale: 'fr' | 'en';
  /** Optional museum-scope filter forwarded to the kNN search (R4). */
  museumQids?: string[];
  /** Optional uploader user id (storage key + audit trail). */
  ownerId?: number;
}

/**
 * Build the compare use-case. The returned function executes the pipeline
 * once per call and is safe to share across requests (no per-call state
 * lives on the closure).
 *
 * @param deps - Structural ports — see {@link CompareUseCaseDeps}.
 * @returns A function that runs the compare pipeline for a single input
 *          and returns the {@link CompareResult} after persisting the
 *          assistant message.
 */
export function compareImageUseCase(
  deps: CompareUseCaseDeps,
): (input: CompareUseCaseInput) => Promise<CompareResult> {
  const { imageProcessor, similarityService, chatService } = deps;

  return async function runCompare(input: CompareUseCaseInput): Promise<CompareResult> {
    // 1) Re-use the shared image processing pipeline (R12). Any failure here
    //    aborts the request — the user message was rejected, so no assistant
    //    turn is persisted.
    const processed = await imageProcessor.process({
      sessionId: input.sessionId,
      buffer: input.buffer,
      mimeType: input.mimeType,
      ...(input.ownerId !== undefined ? { ownerId: input.ownerId } : {}),
    });

    // 2) Run the visual-similarity pipeline against the SANITISED buffer.
    //    The processor may transcode the MIME (e.g. HEIC → JPEG) — forward
    //    its output 1:1 so the embedding step never sees a stale MIME.
    const compareInput: Parameters<SimilarityServicePort['compare']>[0] = {
      buffer: processed.buffer,
      mimeType: processed.mimeType,
      topK: input.topK,
      locale: input.locale,
      ...(input.museumQids !== undefined ? { museumQids: input.museumQids } : {}),
    };
    const result = await similarityService.compare(compareInput);

    // 3) R11 — encoder outage: the route will map this to a 503. Do NOT
    //    persist a ChatMessage so the conversation audit trail stays clean
    //    (no phantom assistant turn for a service-unavailable response).
    //    Other fallback reasons (`no_visual_neighbor`, `quota_exceeded`)
    //    DO persist below so the FE empty-result UX has a stable record.
    if (result.fallbackReason === 'encoder_unavailable') {
      return result;
    }

    // 4) Persist the assistant turn — even on empty matches (R10 / Q7 UX).
    //    `metadata.compareResults` carries the full result envelope so the
    //    FE can rebuild the carousel from the audit log alone, and
    //    `metadata.fallbackReason` mirrors the top-level field for
    //    consumers that only inspect the flat metadata bag.
    const metadata: Record<string, unknown> = {
      compareResults: result,
    };
    if (result.fallbackReason !== undefined) {
      metadata.fallbackReason = result.fallbackReason;
    }
    await chatService.appendAssistantMessage({
      sessionId: input.sessionId,
      metadata,
    });

    return result;
  };
}
