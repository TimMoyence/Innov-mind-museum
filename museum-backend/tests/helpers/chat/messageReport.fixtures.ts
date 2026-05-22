import { MessageReport } from '@modules/chat/domain/message/messageReport.entity';

/**
 * GDPR DSAR (B3) — factory for `MessageReport` rows. Used by the chat-repo
 * export-read tests (`listMessageReportsForUser`) and the DSAR completeness
 * test. Note: `reviewedBy` / `reviewerNotes` / `reviewedAt` are third-party
 * moderator data and MUST be excluded from the subject's export DTO (design D7);
 * the factory still seeds them so the test can assert their ABSENCE downstream.
 * @param overrides - Partial entity override merged on top of the defaults.
 */
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
