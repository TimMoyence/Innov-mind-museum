import type { ChatMessage } from '@modules/chat/domain/chatMessage.entity';
import type { MessageReport } from '@modules/chat/domain/messageReport.entity';
import type { AuditLog } from '@shared/audit/auditLog.entity';

/**
 * Creates a MessageReport entity with sensible defaults. Override any field via `overrides`.
 * @param overrides
 */
export const makeReport = (overrides: Partial<MessageReport> = {}): MessageReport =>
  ({
    id: 'report-001',
    messageId: 'msg-001',
    userId: 1,
    reason: 'offensive',
    comment: null,
    status: 'pending',
    reviewedBy: null,
    reviewedAt: null,
    reviewerNotes: null,
    createdAt: new Date('2025-06-01'),
    message: {
      id: 'msg-001',
      text: 'Bad content',
      role: 'assistant',
      sessionId: 'session-001',
    } as ChatMessage,
    ...overrides,
  }) as MessageReport;

/**
 * Creates an AuditLog entity with sensible defaults. Override any field via `overrides`.
 * @param overrides
 */
export const makeAuditLog = (overrides: Partial<AuditLog> = {}): AuditLog =>
  ({
    id: 'log-001',
    action: 'USER_LOGIN',
    actorType: 'user',
    actorId: 1,
    targetType: null,
    targetId: null,
    metadata: null,
    ip: '127.0.0.1',
    requestId: null,
    createdAt: new Date('2025-06-01'),
    ...overrides,
  }) as AuditLog;
