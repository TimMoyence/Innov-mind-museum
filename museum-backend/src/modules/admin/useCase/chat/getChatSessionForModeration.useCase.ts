import { AUDIT_ADMIN_CHAT_SESSION_VIEWED } from '@shared/audit/audit.types';
import { badRequest, notFound } from '@shared/errors/app.error';

import type { ChatRepository } from '@modules/chat/domain/session/chat.repository.interface';
import type { SessionResult } from '@modules/chat/useCase/orchestration/chat.service.types';
import type { LogActorActionInput } from '@shared/audit/audit.service';

/**
 * Narrowed audit surface so unit tests can pass a `jest.fn()` spy and the
 * admin module does not depend on the concrete `AuditService` class. Mirrors
 * `ExportAuditService` in `exportChatSessions.useCase.ts`.
 */
export interface ModerationAuditService {
  logActorAction(input: LogActorActionInput): Promise<void>;
}

export interface GetChatSessionForModerationInput {
  sessionId: string;
  /** Privileged actor (the admin/moderator performing the read). */
  actorId: number;
  ip?: string | null;
  requestId?: string | null;
  /** Cursor pagination over the session messages (mirrors the owner read). */
  cursor?: string;
  limit?: number;
}

/**
 * Admin moderation read of ANY user's chat session (STREAM H11 / IDOR matrix).
 *
 * Security model (INV-4) — this path DELIBERATELY bypasses
 * `ensureSessionOwnership`: a promoted admin/moderator must be able to read a
 * session they do not own (content moderation, abuse triage). RBAC is enforced
 * upstream at the route (`requireRole('admin', 'moderator')` → 403 for everyone
 * else BEFORE this use case is reached). The ownership-bypass is the whole point
 * of the dedicated path documented in `session-access.ts:11-18` ("Admin
 * moderation must use a dedicated bypass path, not this helper.").
 *
 * Forensic contract (INV-6, SOC2 CC7.2 / GDPR Art. 30): an
 * `ADMIN_CHAT_SESSION_VIEWED` audit row is `await`-ed BEFORE the result is
 * returned (and therefore before the 200 is observable), because the bypass
 * means this is the ONLY record that a privileged cross-user read happened.
 *
 * Not-found contract: a missing / unknown session id returns 404 (notFound) —
 * never a 403 — matching the owner-read enumeration-avoidance stance. Invalid
 * (non-UUID) ids return 400 via the same validation as the owner path.
 */
export class GetChatSessionForModerationUseCase {
  constructor(
    private readonly repository: ChatRepository,
    private readonly audit: ModerationAuditService,
  ) {}

  async execute(input: GetChatSessionForModerationInput): Promise<SessionResult> {
    // `getSessionById` does NO ownership check (INV-4) — admin bypass.
    // `findOne` returns null for a non-existent UUID; an invalid (non-UUID)
    // string would make Postgres throw, so guard the format first to keep the
    // 400-vs-404 contract identical to the owner read (`session-access.ts`).
    const session = await this.fetchSession(input.sessionId);

    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- zero fallback
    const limit = Math.max(1, Math.min(input.limit || 20, 50));
    const page = await this.repository.listSessionMessages({
      sessionId: input.sessionId,
      limit,
      cursor: input.cursor,
    });

    // INV-6 — audit BEFORE the response is observable. `targetId` is the
    // session id; `metadata` carries only the (non-PII) owner id so an auditor
    // can correlate the cross-user access. No message content in the audit row.
    await this.audit.logActorAction({
      action: AUDIT_ADMIN_CHAT_SESSION_VIEWED,
      actorId: input.actorId,
      targetType: 'chat_session',
      targetId: input.sessionId,
      metadata: { ownerUserId: session.user?.id ?? null },
      ip: input.ip ?? null,
      requestId: input.requestId ?? null,
    });

    return {
      session: {
        id: session.id,
        locale: session.locale,
        museumMode: session.museumMode,
        title: session.title ?? null,
        museumName: session.museumName ?? null,
        createdAt: session.createdAt.toISOString(),
        updatedAt: session.updatedAt.toISOString(),
        intent: session.intent,
      },
      messages: page.messages.map((message) => ({
        id: message.id,
        role: message.role,
        text: message.text,
        imageRef: message.imageRef,
        image: null,
        createdAt: message.createdAt.toISOString(),
        metadata: message.metadata,
      })),
      page: {
        nextCursor: page.nextCursor,
        hasMore: page.hasMore,
        limit,
      },
    };
  }

  private async fetchSession(
    sessionId: string,
  ): Promise<NonNullable<Awaited<ReturnType<ChatRepository['getSessionById']>>>> {
    let session: Awaited<ReturnType<ChatRepository['getSessionById']>>;
    try {
      session = await this.repository.getSessionById(sessionId);
    } catch {
      // A malformed UUID makes the pg driver throw on the `id = $1` predicate.
      // Treat it as a client error (400) rather than leaking a 500 — same
      // 400-on-bad-id contract as the owner read.
      throw badRequest('Invalid session id format');
    }
    if (!session) {
      throw notFound('Chat session not found');
    }
    return session;
  }
}
