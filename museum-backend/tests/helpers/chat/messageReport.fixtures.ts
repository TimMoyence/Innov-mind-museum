import { MessageReport } from '@modules/chat/domain/message/messageReport.entity';

export function makeMessageReport(overrides: Partial<MessageReport> = {}): MessageReport {
  return Object.assign(new MessageReport(), {
    id: 'rep-uuid-1',
    messageId: 'msg-uuid-2',
    userId: 42,
    reason: 'inaccurate',
    comment: 'This answer is wrong.',
    status: 'pending',
    reviewedBy: 7,
    reviewedAt: new Date('2026-01-03T00:00:00.000Z'),
    reviewerNotes: 'internal moderator note — not the data subject',
    createdAt: new Date('2026-01-02T12:00:00.000Z'),
    ...overrides,
  });
}
