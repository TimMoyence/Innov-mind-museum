import * as chatRepoAudio from '@modules/chat/adapters/secondary/persistence/chat-repository-audio';
import * as chatRepoFeedback from '@modules/chat/adapters/secondary/persistence/chat-repository-feedback';

import type { ChatMessage } from '@modules/chat/domain/message/chatMessage.entity';
import type { MessageFeedback } from '@modules/chat/domain/message/messageFeedback.entity';
import type { MessageReport } from '@modules/chat/domain/message/messageReport.entity';
import type { Repository } from 'typeorm';

export interface MessageFeedbackExportRow {
  messageId: string;
  value: string;
  createdAt: Date | string;
}

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

export function getFindAudioRefsByUserId(): AudioRefsFn | undefined {
  return (chatRepoAudio as unknown as Record<string, AudioRefsFn | undefined>)
    .findAudioRefsByUserId;
}

export function getListMessageFeedbackForUser(): FeedbackReadFn | undefined {
  return (chatRepoFeedback as unknown as Record<string, FeedbackReadFn | undefined>)
    .listMessageFeedbackForUser;
}

export function getListMessageReportsForUser(): ReportReadFn | undefined {
  return (chatRepoFeedback as unknown as Record<string, ReportReadFn | undefined>)
    .listMessageReportsForUser;
}
