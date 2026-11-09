import { validateSources } from '@modules/chat/useCase/orchestration/sources-validator';
import { computeSessionUpdates } from '@modules/chat/useCase/session/visit-context';
import { conflict } from '@shared/errors/app.error';
import { resolveLocale } from '@shared/i18n/locale';
import { sanitizePromptInput } from '@shared/validation/input';

import type { PostMessageResult } from './chat.service.types';
import type { UrlHeadProbe } from './url-head-probe';
import type { CitationSource, EnrichedImage } from '@modules/chat/domain/chat.types';
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
  urlHeadProbe?: UrlHeadProbe;
}

async function applyAntiHallucinationFilters(
  metadata: ReturnType<typeof buildCommitPayload>['assistantMetadata'],
  grounding: {
    allowed: boolean;
    routerFacts?: readonly string[];
    routerSources?: readonly CitationSource[];
  },
  urlHeadProbe: UrlHeadProbe | undefined,
): Promise<void> {
  const { allowed, routerFacts, routerSources } = grounding;
  if (metadata.sources && metadata.sources.length > 0 && routerFacts && routerFacts.length > 0) {
    const { valid } = validateSources(metadata.sources, [...routerFacts]);
    metadata.sources = valid.length > 0 ? valid : undefined;
  }

  if (allowed && !metadata.sources?.length && routerSources?.length) {
    metadata.sources = [...routerSources];
  }

  if (metadata.sources && metadata.sources.length > 0 && urlHeadProbe) {
    const probeMap = await urlHeadProbe.probeBatch(metadata.sources.map((s) => s.url));
    const reachable = metadata.sources.filter((s) => probeMap.get(s.url)?.reachable === true);
    metadata.sources = reachable.length > 0 ? reachable : undefined;
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
      .catch(() => undefined);
  }
}

async function persistAssistantMessage(
  repository: ChatRepository,
  sessionId: string,
  payload: {
    assistantText: string;
    assistantMetadata: ReturnType<typeof buildCommitPayload>['assistantMetadata'];
    sessionUpdates: ReturnType<typeof buildCommitPayload>['sessionUpdates'];
    artworkMatch: ReturnType<typeof buildCommitPayload>['artworkMatch'];
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
    routerFacts?: readonly string[];
    routerSources?: readonly CitationSource[];
    cacheKey?: string | null;
  },
): Promise<PostMessageResult> {
  const { requestedLocale, ownerId, enrichedImages, requestId, ip, cacheKey } = options;
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

  const grounding = { ...options, allowed: outputCheck.allowed };
  await applyAntiHallucinationFilters(assistantMetadata, grounding, deps.urlHeadProbe);

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

  assistantMetadata.phase = 'done';

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
