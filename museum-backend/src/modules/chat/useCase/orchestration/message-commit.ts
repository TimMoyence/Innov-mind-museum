import { computeSessionUpdates } from '@modules/chat/useCase/session/visit-context';
import { conflict } from '@shared/errors/app.error';
import { resolveLocale } from '@shared/i18n/locale';
import { sanitizePromptInput } from '@shared/validation/input';

import type { PostMessageResult } from './chat.service.types';
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
  },
): Promise<PostMessageResult> {
  const { requestedLocale, ownerId, enrichedImages, requestId, ip } = options;
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
    /*
     * ChatSession optimistic-lock policy — surface 409, do NOT auto-retry.
     *
     * The assistant reply was generated against an older session snapshot
     * (visit context, museum mode, intent, etc.). Retrying the persistMessage
     * call against a refreshed session would commit a reply that may
     * disagree with the current session state — silent inconsistency.
     *
     * The 409 forces the client to refresh and re-prompt, so the next
     * generation runs against the up-to-date session.
     *
     * The Museum admin path (C.1, withOptimisticLockRetry) auto-retries
     * because admin edits are a single short transaction; here the prior
     * LLM call cannot be safely re-run.
     */
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
    session.locale,
  );

  const mapped = (aiResult.suggestions ?? [])
    .map((s) => sanitizePromptInput(s, 60))
    .filter((s) => s.length > 0);
  const sanitizedSuggestions = mapped.length > 0 ? mapped : undefined;

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
