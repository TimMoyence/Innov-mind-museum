import { validateSources } from '@modules/chat/useCase/orchestration/sources-validator';
import { computeSessionUpdates } from '@modules/chat/useCase/session/visit-context';
import { conflict } from '@shared/errors/app.error';
import { resolveLocale } from '@shared/i18n/locale';
import { emitChatPhaseSpan } from '@shared/observability/chat-phase-span';
import { chatSourcesEmittedTotal } from '@shared/observability/prometheus-metrics';
import { sanitizePromptInput } from '@shared/validation/input';

import type { PostMessageResult } from './chat.service.types';
import type { UrlHeadProbe } from './url-head-probe';
import type { EnrichedImage } from '@modules/chat/domain/chat.types';
import type { OrchestratorOutput } from '@modules/chat/domain/ports/chat-orchestrator.port';
import type { ChatRepository } from '@modules/chat/domain/session/chat.repository.interface';
import type { GuardrailEvaluationService } from '@modules/chat/useCase/guardrail/guardrail-evaluation.service';
import type { UserMemoryService } from '@modules/chat/useCase/memory/user-memory.service';
import type { ensureSessionAccess } from '@modules/chat/useCase/session/session-access';
import type { CacheService } from '@shared/cache/cache.port';

/** Dependencies needed by commitAssistantResponse. */
interface CommitDeps {
  guardrail: GuardrailEvaluationService;
  repository: ChatRepository;
  cache?: CacheService;
  userMemory?: UserMemoryService;
  /**
   * C4 (T2.6) — Optional URL reachability probe. When injected, after the
   * substring-match validator has dropped hallucinated quotes, the surviving
   * `metadata.sources` URLs are HEAD-probed and unreachable ones filtered out.
   * Left undefined at V1 composition root (Option C — see STORY.md decision)
   * because the per-URL ≤ 800 ms timeout is additive to chat p99 latency and
   * the upstream hosts (Wikidata, Louvre, Wikimedia) have variable response
   * profiles ; turning it on is a V1.1 rollout after p99 baking.
   *
   * Backward-compat (NFR8) : undefined → skip silently, no behaviour change.
   */
  urlHeadProbe?: UrlHeadProbe;
}

/**
 * C4 (T2.6) — Post-LLM grounding gate.
 *
 * Mutates `metadata.sources` in place to retain only the citations whose
 * `quote` is a verbatim substring of the router-supplied fact corpus.
 * No-op when either the LLM emitted no `sources[]` (parser returned
 * `undefined` per `assistant-response.toSources` convention) OR the request
 * has no fact context (legacy harnesses without `KnowledgeRouterPort`, or
 * the router returned `source: 'none'`).
 *
 * The validator itself is pure (no I/O, NFR2-safe — adds < 1 ms p99) so
 * wiring it unconditionally is safe ; the optional `urlHeadProbe` HEAD
 * filtering is gated behind a separate DI seam (NFR2 cost).
 *
 * Spec   : `team-state/2026-05-11-c4-anti-hallucination/spec.md` §R4 / R5.
 * Design : `team-state/2026-05-11-c4-anti-hallucination/design.md` §S5.
 */
async function applyAntiHallucinationFilters(
  metadata: ReturnType<typeof buildCommitPayload>['assistantMetadata'],
  routerFacts: readonly string[] | undefined,
  urlHeadProbe: UrlHeadProbe | undefined,
): Promise<void> {
  // Validator pass — drop hallucinated quotes (R4).
  if (metadata.sources && metadata.sources.length > 0 && routerFacts && routerFacts.length > 0) {
    const { valid } = validateSources(metadata.sources, [...routerFacts]);
    metadata.sources = valid.length > 0 ? valid : undefined;
  }

  // HEAD probe pass — drop unreachable URLs (R5). Optional ; injected only in
  // environments that have accepted the latency cost (V1.1+).
  if (metadata.sources && metadata.sources.length > 0 && urlHeadProbe) {
    const probeMap = await urlHeadProbe.probeBatch(metadata.sources.map((s) => s.url));
    const reachable = metadata.sources.filter((s) => probeMap.get(s.url)?.reachable === true);
    metadata.sources = reachable.length > 0 ? reachable : undefined;
  }

  // C4 T7.3 — count every source that survived the anti-hallucination filters
  // (post-validator, post-HEAD-probe). Partitioned by `type` so Grafana can
  // chart citation rate per provenance (wikidata / web / commons / museum-catalog).
  // Cardinality bounded by `CitationSource.type` literal-union (≤ 4 values).
  if (metadata.sources && metadata.sources.length > 0) {
    for (const s of metadata.sources) {
      chatSourcesEmittedTotal.inc({ type: s.type });
    }
  }
}

/** Builds session updates and artwork match from the guardrail output and LLM result. */
function buildCommitPayload(
  session: Awaited<ReturnType<typeof ensureSessionAccess>>,
  outputCheck: Awaited<ReturnType<GuardrailEvaluationService['evaluateOutput']>>,
  aiResult: OrchestratorOutput,
  requestedLocale: string | undefined,
  enrichedImages?: EnrichedImage[],
) {
  const assistantMetadata = outputCheck.metadata;

  if (enrichedImages && enrichedImages.length > 0) {
    assistantMetadata.images = enrichedImages;
  }

  const baseSessionUpdates = outputCheck.allowed
    ? computeSessionUpdates(session, assistantMetadata, 'pending')
    : undefined;

  const normalizedLocale = requestedLocale ? resolveLocale([requestedLocale]) : undefined;
  const localeChanged = normalizedLocale && normalizedLocale !== resolveLocale([session.locale]);
  const sessionUpdates = localeChanged
    ? { ...baseSessionUpdates, locale: normalizedLocale }
    : baseSessionUpdates;

  const artworkMatch =
    outputCheck.allowed && aiResult.metadata.detectedArtwork
      ? {
          artworkId: aiResult.metadata.detectedArtwork.artworkId,
          title: aiResult.metadata.detectedArtwork.title,
          artist: aiResult.metadata.detectedArtwork.artist,
          confidence: aiResult.metadata.detectedArtwork.confidence,
          source: aiResult.metadata.detectedArtwork.source,
          room: aiResult.metadata.detectedArtwork.room,
        }
      : undefined;

  return { assistantText: outputCheck.text, assistantMetadata, sessionUpdates, artworkMatch };
}

/** Invalidates caches and triggers fire-and-forget user memory update. */
export async function postCommitSideEffects(
  deps: { cache?: CacheService; userMemory?: UserMemoryService },
  sessionId: string,
  ownerId: number | undefined,
  sessionUpdates: ReturnType<typeof computeSessionUpdates> | undefined,
  locale?: string | null,
): Promise<void> {
  if (deps.cache) {
    await deps.cache.delByPrefix(`session:${sessionId}:`);
    if (ownerId) {
      await deps.cache.delByPrefix(`sessions:user:${String(ownerId)}:`);
    }
  }

  if (deps.userMemory && ownerId && sessionUpdates?.visitContext) {
    deps.userMemory
      .updateAfterSession(ownerId, sessionUpdates.visitContext, sessionId, locale ?? 'en')
      .catch(() => {
        // swallowed — user memory is non-critical
      });
  }
}

/**
 * Persist the assistant message row. Extracted so the optimistic-lock
 * translation policy (long-form comment below) lives in one place AND
 * `commitAssistantResponse` stays under the 80-line cap.
 *
 * ChatSession optimistic-lock policy — surface 409, do NOT auto-retry.
 *
 * The assistant reply was generated against an older session snapshot (visit
 * context, museum mode, intent, etc.). Retrying the persistMessage call
 * against a refreshed session would commit a reply that may disagree with
 * the current session state — silent inconsistency.
 *
 * The 409 forces the client to refresh and re-prompt, so the next generation
 * runs against the up-to-date session.
 *
 * The Museum admin path (C.1, withOptimisticLockRetry) auto-retries because
 * admin edits are a single short transaction ; here the prior LLM call
 * cannot be safely re-run.
 */
async function persistAssistantMessage(
  repository: ChatRepository,
  sessionId: string,
  payload: {
    assistantText: string;
    assistantMetadata: ReturnType<typeof buildCommitPayload>['assistantMetadata'];
    sessionUpdates: ReturnType<typeof buildCommitPayload>['sessionUpdates'];
    artworkMatch: ReturnType<typeof buildCommitPayload>['artworkMatch'];
  },
): Promise<Awaited<ReturnType<ChatRepository['persistMessage']>>> {
  try {
    return await repository.persistMessage({
      sessionId,
      role: 'assistant',
      text: payload.assistantText,
      metadata: payload.assistantMetadata as Record<string, unknown>,
      sessionUpdates: payload.sessionUpdates,
      artworkMatch: payload.artworkMatch,
    });
  } catch (error) {
    if ((error as Error).name === 'OptimisticLockVersionMismatchError') {
      throw conflict('Session was modified concurrently');
    }
    throw error;
  }
}

/**
 * Persists the assistant response and returns the result. Shared by postMessage and postMessageStream.
 */
export async function commitAssistantResponse(
  deps: CommitDeps,
  sessionId: string,
  session: Awaited<ReturnType<typeof ensureSessionAccess>>,
  aiResult: OrchestratorOutput,
  options: {
    requestedLocale: string | undefined;
    ownerId: number | undefined;
    enrichedImages?: EnrichedImage[];
    requestId?: string;
    ip?: string;
    /**
     * C4 (T2.6) — Verified fact strings from `KnowledgeRouter.resolve()` that
     * fed the same LLM call. Used by the post-LLM grounding gate to drop
     * citations whose `quote` is not a verbatim substring of any fact. Absent
     * (undefined or empty) → grounding gate skipped (NFR8 backward-compat for
     * legacy harnesses without a `KnowledgeRouterPort`).
     */
    routerFacts?: readonly string[];
  },
): Promise<PostMessageResult> {
  const { requestedLocale, ownerId, enrichedImages, requestId, ip, routerFacts } = options;
  const outputCheck = await deps.guardrail.evaluateOutput({
    text: aiResult.text,
    metadata: aiResult.metadata,
    requestedLocale,
    context: {
      sessionId,
      userId: ownerId,
      requestId,
      ip,
      locale: requestedLocale,
    },
  });

  const { assistantText, assistantMetadata, sessionUpdates, artworkMatch } = buildCommitPayload(
    session,
    outputCheck,
    aiResult,
    requestedLocale,
    enrichedImages,
  );

  // C4 (T2.6) — Post-LLM anti-hallucination filters. Run after the guardrail
  // built `assistantMetadata` so the dropped sources never reach the persisted
  // row OR the API response. In-place mutation matches the rest of the commit
  // flow (e.g. `assistantMetadata.images = enrichedImages` above).
  await applyAntiHallucinationFilters(assistantMetadata, routerFacts, deps.urlHeadProbe);

  const assistantMessage = await persistAssistantMessage(deps.repository, sessionId, {
    assistantText,
    assistantMetadata,
    sessionUpdates,
    artworkMatch,
  });

  if (outputCheck.allowed && sessionUpdates?.visitContext) {
    const pendingArtwork = sessionUpdates.visitContext.artworksDiscussed.find(
      (a) => a.messageId === 'pending',
    );
    if (pendingArtwork) {
      pendingArtwork.messageId = assistantMessage.id;
    }
  }

  await postCommitSideEffects(
    { cache: deps.cache, userMemory: deps.userMemory },
    sessionId,
    ownerId,
    sessionUpdates,
    session.locale,
  );

  const mapped = (aiResult.suggestions ?? [])
    .map((s) => sanitizePromptInput(s, 60))
    .filter((s) => s.length > 0);
  const sanitizedSuggestions = mapped.length > 0 ? mapped : undefined;

  // A5 (R1) — Mark the pipeline as having reached its terminal phase. Any
  // refusal path that returns early from the orchestrator never reaches this
  // line ; that branch is owned by `guardrail-evaluation.service` and decides
  // its own `phase` value. On the success path uniformity wins : `done` means
  // "the pipeline ran end-to-end, whatever it returned" (spec §1.1 R1).
  assistantMetadata.phase = 'done';
  // A5 (R9) — Emit a terminal `chat.phase.done` Langfuse trace so the
  // timeline has a closing marker per chat request, sibling of the per-phase
  // spans emitted by the pipeline + orchestrator + TTS adapter. Fail-open via
  // `safeTrace`.
  emitChatPhaseSpan('done', Date.now(), { sessionId });

  return {
    sessionId,
    message: {
      id: assistantMessage.id,
      role: 'assistant',
      text: assistantText,
      createdAt: assistantMessage.createdAt.toISOString(),
      ...(sanitizedSuggestions ? { suggestions: sanitizedSuggestions } : {}),
    },
    metadata: assistantMetadata,
  };
}
