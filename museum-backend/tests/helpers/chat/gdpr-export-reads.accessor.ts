/**
 * GDPR erasure/DSAR run (2026-05-21-gdpr-erasure-chain) — typed accessors for
 * chat-repository read helpers that DO NOT EXIST YET at red-phase time.
 *
 * The red tests must typecheck against the full project (`pnpm lint` runs
 * `tsc --noEmit` over `tests/**`). Importing a not-yet-declared named export
 * from an existing module would be a TS2305 compile error. We therefore reach
 * the future symbols through a namespace cast (allowed in `tests/helpers/`),
 * returning `undefined` when the green phase has not added them. The tests then
 * fail at RUNTIME (the symbol is undefined / the call throws), which is the
 * intended red-phase outcome.
 *
 * GREEN contract (T1.2 / T1.10):
 *  - `findAudioRefsByUserId(repo, userId)` lives in `chat-repository-audio.ts`
 *    (mirror of `findLegacyImageRefsByUserId`).
 *  - `listMessageFeedbackForUser(repo, userId)` + `listMessageReportsForUser`
 *    live in `chat-repository-feedback.ts` (or a `chat-repository-export.ts`
 *    helper re-exported from it). The accessor below resolves them from
 *    `chat-repository-feedback.ts`; if the green author places them in a new
 *    file, re-export from `chat-repository-feedback.ts` so this accessor keeps
 *    working WITHOUT editing this frozen test helper.
 */
import * as chatRepoAudio from '@modules/chat/adapters/secondary/persistence/chat-repository-audio';
import * as chatRepoFeedback from '@modules/chat/adapters/secondary/persistence/chat-repository-feedback';

import type { ChatMessage } from '@modules/chat/domain/message/chatMessage.entity';
import type { MessageFeedback } from '@modules/chat/domain/message/messageFeedback.entity';
import type { MessageReport } from '@modules/chat/domain/message/messageReport.entity';
import type { Repository } from 'typeorm';

/** Subject-facing message-feedback export row (T1.10 / B3). */
export interface MessageFeedbackExportRow {
  messageId: string;
  value: string;
  createdAt: Date | string;
}

/**
 * Subject-facing message-report export row (T1.10 / B3, design D7).
 * `reviewedBy` / `reviewerNotes` / `reviewedAt` are third-party moderator data
 * and are intentionally NOT part of this shape.
 */
export interface MessageReportExportRow {
  messageId: string;
  reason: string;
  comment: string | null;
  status: string;
  createdAt: Date | string;
}

type AudioRefsFn = (repo: Repository<ChatMessage>, userId: number) => Promise<string[]>;
type FeedbackReadFn = (
  repo: Repository<MessageFeedback>,
  userId: number,
) => Promise<MessageFeedbackExportRow[]>;
type ReportReadFn = (
  repo: Repository<MessageReport>,
  userId: number,
) => Promise<MessageReportExportRow[]>;

/** Returns the future `findAudioRefsByUserId` or `undefined` if not yet implemented. */
export function getFindAudioRefsByUserId(): AudioRefsFn | undefined {
  return (chatRepoAudio as unknown as Record<string, AudioRefsFn | undefined>)
    .findAudioRefsByUserId;
}

/** Returns the future `listMessageFeedbackForUser` or `undefined`. */
export function getListMessageFeedbackForUser(): FeedbackReadFn | undefined {
  return (chatRepoFeedback as unknown as Record<string, FeedbackReadFn | undefined>)
    .listMessageFeedbackForUser;
}

/** Returns the future `listMessageReportsForUser` or `undefined`. */
export function getListMessageReportsForUser(): ReportReadFn | undefined {
  return (chatRepoFeedback as unknown as Record<string, ReportReadFn | undefined>)
    .listMessageReportsForUser;
}
