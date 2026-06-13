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

interface CommitDeps {
  guardrail: GuardrailEvaluationService;
  repository: ChatRepository;
  cache?: CacheService;
  userMemory?: UserMemoryService;
  /**
   * C4 — left undefined at V1 root; per-URL ≤800ms is additive to p99.
   * V1.1 rollout after baking. NFR8: undefined → skip silently.
   */
  urlHeadProbe?: UrlHeadProbe;
}

/**
 * C4 — post-LLM grounding gate. Mutates `metadata.sources` in place to retain
 * only citations whose `quote` is verbatim substring of router-supplied facts.
 * No-op when LLM emitted no sources OR no fact context. Validator is pure
 * (<1ms p99); urlHeadProbe gated separately (NFR2 cost).
 */
async function applyAntiHallucinationFilters(
  metadata: ReturnType<typeof buildCommitPayload>['assistantMetadata'],
  routerFacts: readonly string[] | undefined,
  urlHeadProbe: UrlHeadProbe | undefined,
): Promise<void> {
  // R4 — drop hallucinated quotes.
  if (metadata.sources && metadata.sources.length > 0 && routerFacts && routerFacts.length > 0) {
    const { valid } = validateSources(metadata.sources, [...routerFacts]);
    metadata.sources = valid.length > 0 ? valid : undefined;
  }

  // R5 — drop unreachable URLs. Injected only where latency cost accepted.
  if (metadata.sources && metadata.sources.length > 0 && urlHeadProbe) {
    const probeMap = await urlHeadProbe.probeBatch(metadata.sources.map((s) => s.url));
    const reachable = metadata.sources.filter((s) => probeMap.get(s.url)?.reachable === true);
    metadata.sources = reachable.length > 0 ? reachable : undefined;
  }

  // Cardinality bounded by CitationSource.type literal-union (≤ 4 values).
  if (metadata.sources && metadata.sources.length > 0) {
    for (const s of metadata.sources) {
      chatSourcesEmittedTotal.inc({ type: s.type });
    }
  }
}

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
 * Optimistic-lock policy: surface 409, do NOT auto-retry — reply was generated
 * against older session snapshot; retrying would silently commit a reply that
 * disagrees with current session state. Client must refresh + re-prompt.
 * (Admin C.1 auto-retries because edits are a single short tx.)
 */
async function persistAssistantMessage(
  repository: ChatRepository,
  sessionId: string,
  payload: {
    assistantText: string;
    assistantMetadata: ReturnType<typeof buildCommitPayload>['assistantMetadata'];
    sessionUpdates: ReturnType<typeof buildCommitPayload>['sessionUpdates'];
    artworkMatch: ReturnType<typeof buildCommitPayload>['artworkMatch'];
    /** PR-P0-1 (2026-05-23) — LLM-cache-invalidation cookie. Null when not cached. */
    cacheKey?: string | null;
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
      cacheKey: payload.cacheKey ?? null,
    });
  } catch (error) {
    if ((error as Error).name === 'OptimisticLockVersionMismatchError') {
      throw conflict('Session was modified concurrently');
    }
    throw error;
  }
}

/** Commits an assistant response (guardrail + persist + cache + memory). */
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
    /** Absent → grounding gate skipped (NFR8 backward-compat). */
    routerFacts?: readonly string[];
    /**
     * PR-P0-1 (2026-05-23) — exact `llm:{KEY_VERSION}:*` Redis key emitted by
     * `LlmCacheServiceImpl.computeKey` when the assistant response was
     * cached. Null/absent for non-cached paths (image-only, no llmCache,
     * image present but no visual signature, etc.). Stamped on the
     * persisted message row for targeted feedback-driven invalidation.
     */
    cacheKey?: string | null;
  },
): Promise<PostMessageResult> {
  const { requestedLocale, ownerId, enrichedImages, requestId, ip, routerFacts, cacheKey } =
    options;
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

  // C4 — run after guardrail so dropped sources never reach persisted row or
  // API response. In-place mutation matches rest of commit flow.
  await applyAntiHallucinationFilters(assistantMetadata, routerFacts, deps.urlHeadProbe);

  const assistantMessage = await persistAssistantMessage(deps.repository, sessionId, {
    assistantText,
    assistantMetadata,
    sessionUpdates,
    artworkMatch,
    cacheKey: cacheKey ?? null,
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

  // A5 R1 — `done` = pipeline ran E2E (success path). Refusal path owned by
  // guardrail-evaluation.service decides its own phase.
  assistantMetadata.phase = 'done';
  // A5 R9 — terminal Langfuse span (fail-open via safeTrace).
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
