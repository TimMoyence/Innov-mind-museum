import {
  toPageLimit,
  toSessionDTO,
  toSessionMessageView,
  withHttpsImages,
} from '@modules/chat/useCase/session/session.view';
import { AUDIT_ADMIN_CHAT_SESSION_VIEWED } from '@shared/audit/audit.types';
import { invalidInput, notFound } from '@shared/errors/app.error';

import type { ChatRepository } from '@modules/chat/domain/session/chat.repository.interface';
import type { SessionResult } from '@modules/chat/useCase/orchestration/chat.service.types';
import type { LogActorActionInput } from '@shared/audit/audit.service';

export interface ModerationAuditService {
  logActorAction(input: LogActorActionInput): Promise<void>;
}

export interface GetChatSessionForModerationInput {
  sessionId: string;
  actorId: number;
  ip?: string | null;
  requestId?: string | null;
  cursor?: string;
  limit?: number;
}

export class GetChatSessionForModerationUseCase {
  constructor(
    private readonly repository: ChatRepository,
    private readonly audit: ModerationAuditService,
  ) {}

  async execute(input: GetChatSessionForModerationInput): Promise<SessionResult> {
    const session = await this.fetchSession(input.sessionId);

    const limit = toPageLimit(input.limit);
    const page = await this.repository.listSessionMessages({
      sessionId: input.sessionId,
      limit,
      cursor: input.cursor,
    });

    await this.audit.logActorAction({
      action: AUDIT_ADMIN_CHAT_SESSION_VIEWED,
      actorId: input.actorId,
      targetType: 'chat_session',
      targetId: input.sessionId,
      metadata: { ownerUserId: session.user?.id ?? null },
      ip: input.ip ?? null,
      requestId: input.requestId ?? null,
    });

    return withHttpsImages({
      session: toSessionDTO(session),
      messages: page.messages.map(toSessionMessageView),
      page: {
        nextCursor: page.nextCursor,
        hasMore: page.hasMore,
        limit,
      },
    });
  }

  private async fetchSession(
    sessionId: string,
  ): Promise<NonNullable<Awaited<ReturnType<ChatRepository['getSessionById']>>>> {
    let session: Awaited<ReturnType<ChatRepository['getSessionById']>>;
    try {
      session = await this.repository.getSessionById(sessionId);
    } catch {
      throw invalidInput('Invalid session id format');
    }
    if (!session) {
      throw notFound('Chat session not found');
    }
    return session;
  }
}
