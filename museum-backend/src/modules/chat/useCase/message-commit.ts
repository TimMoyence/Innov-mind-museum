import { conflict } from '@shared/errors/app.error';
import { resolveLocale } from '@shared/i18n/locale';

import { computeSessionUpdates } from './visit-context';

import type { PostMessageResult } from './chat.service.types';
import type { GuardrailEvaluationService } from './guardrail-evaluation.service';
import type { ensureSessionAccess } from './session-access';
import type { UserMemoryService } from './user-memory.service';
import type { ChatRepository } from '../domain/chat.repository.interface';
import type { EnrichedImage } from '../domain/chat.types';
import type { OrchestratorOutput } from '../domain/ports/chat-orchestrator.port';
import type { CacheService } from '@shared/cache/cache.port';

/** Dependencies needed by commitAssistantResponse. */
export interface CommitDeps {
  guardrail: GuardrailEvaluationService;
  repository: ChatRepository;
  cache?: CacheService;
  userMemory?: UserMemoryService;
}

/** Builds session updates and artwork match from the guardrail output and LLM result. */
export function buildCommitPayload(
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
): Promise<void> {
  if (deps.cache) {
    await deps.cache.delByPrefix(`session:${sessionId}:`);
    if (ownerId) {
      await deps.cache.delByPrefix(`sessions:user:${String(ownerId)}:`);
    }
  }

  if (deps.userMemory && ownerId && sessionUpdates?.visitContext) {
    deps.userMemory
      .updateAfterSession(ownerId, sessionUpdates.visitContext, sessionId)
      .catch(() => {
        // swallowed — user memory is non-critical
      });
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
  },
): Promise<PostMessageResult> {
  const { requestedLocale, ownerId, enrichedImages } = options;
  const outputCheck = await deps.guardrail.evaluateOutput({
    text: aiResult.text,
    metadata: aiResult.metadata,
    requestedLocale,
  });

  const { assistantText, assistantMetadata, sessionUpdates, artworkMatch } = buildCommitPayload(
    session,
    outputCheck,
    aiResult,
    requestedLocale,
    enrichedImages,
  );

  let assistantMessage;
  try {
    assistantMessage = await deps.repository.persistMessage({
      sessionId,
      role: 'assistant',
      text: assistantText,
      metadata: assistantMetadata as Record<string, unknown>,
      sessionUpdates,
      artworkMatch,
    });
  } catch (error) {
    if ((error as Error).name === 'OptimisticLockVersionMismatchError') {
      throw conflict('Session was modified concurrently');
    }
    throw error;
  }

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
  );

  return {
    sessionId,
    message: {
      id: assistantMessage.id,
      role: 'assistant',
      text: assistantText,
      createdAt: assistantMessage.createdAt.toISOString(),
    },
    metadata: assistantMetadata,
  };
}
