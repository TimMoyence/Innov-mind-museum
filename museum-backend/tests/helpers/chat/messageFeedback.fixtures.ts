import { MessageFeedback } from '@modules/chat/domain/message/messageFeedback.entity';

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
