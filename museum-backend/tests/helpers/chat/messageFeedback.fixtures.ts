import { MessageFeedback } from '@modules/chat/domain/message/messageFeedback.entity';

/**
 * GDPR DSAR (B3) — factory for `MessageFeedback` rows. Used by the chat-repo
 * export-read tests (`listMessageFeedbackForUser`) and the DSAR completeness
 * test. Inline `as MessageFeedback` is forbidden in tests (CLAUDE.md test
 * discipline); always build through this factory.
 * @param overrides - Partial entity override merged on top of the defaults.
 */
export function makeMessageFeedback(overrides: Partial<MessageFeedback> = {}): MessageFeedback {
  return Object.assign(new MessageFeedback(), {
    id: 'fb-uuid-1',
    messageId: 'msg-uuid-1',
    userId: 42,
    value: 'positive',
    createdAt: new Date('2026-01-02T00:00:00.000Z'),
    ...overrides,
  });
}
