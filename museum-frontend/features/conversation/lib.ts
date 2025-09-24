import {
  type ConversationDTO,
  type ConversationMessageDTO,
} from '@/services/conversationService';
import type { ConversationListItem } from './types';

export const DEFAULT_DISCUSSION_IMAGE =
  'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=800&q=60';

const toSafeDate = (value?: string | number | Date): Date | null => {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const formatTimestamp = (value?: string | number | Date): string => {
  const date = toSafeDate(value);

  if (!date) {
    return 'Unk. date';
  }

  return date.toLocaleString([], {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const sortMessagesChronologically = (
  messages: ConversationMessageDTO[] = [],
): ConversationMessageDTO[] => {
  return [...messages].sort((left, right) => {
    const leftDate = toSafeDate(left.createdAt ?? left.timestamp);
    const rightDate = toSafeDate(right.createdAt ?? right.timestamp);

    return (leftDate?.getTime() ?? 0) - (rightDate?.getTime() ?? 0);
  });
};

export const normaliseConversation = (
  conversation: ConversationDTO,
): ConversationListItem => {
  const messages = sortMessagesChronologically(conversation.messages);
  const lastMessage = messages.at(-1);
  const assistantMessages = messages.filter((msg) => msg.role === 'assistant');

  const baseTitle =
    lastMessage?.content ?? assistantMessages[0]?.content ?? 'AI conversation';
  const title =
    baseTitle.length > 80 ? `${baseTitle.slice(0, 77)}...` : baseTitle;

  const createdAt =
    lastMessage?.createdAt ??
    lastMessage?.timestamp ??
    conversation.createdAt ??
    new Date().toISOString();

  const tags: string[] = ['AI Chat'];

  if (conversation.imageUrl) {
    tags.push('Image Insight');
  }

  if (assistantMessages.length) {
    tags.push('Assistant');
  }

  return {
    id: conversation.id,
    imageUrl: conversation.imageUrl || DEFAULT_DISCUSSION_IMAGE,
    title,
    location: conversation.user?.firstname
      ? `Visitor: ${conversation.user.firstname}`
      : 'Visitor: Anonymous',
    time: formatTimestamp(createdAt),
    participants: Math.max(messages.length, 1),
    tags,
  };
};
