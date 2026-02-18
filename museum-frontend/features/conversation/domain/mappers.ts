import type { ChatMessage } from '../types';

export const mapToChatMessage = (message: {
  id?: string;
  content?: string;
  text?: string;
  isFromAI?: boolean;
  role?: 'user' | 'assistant';
  timestamp?: string | number;
  createdAt?: string | number;
}): ChatMessage => ({
  id: message.id || Date.now().toString(),
  text: message.content || message.text || 'Message sans contenu',
  sender:
    message.isFromAI !== undefined
      ? message.isFromAI
        ? 'ai'
        : 'user'
      : message.role === 'assistant'
        ? 'ai'
        : 'user',
  timestamp: new Date(message.timestamp || message.createdAt || Date.now()),
});

export const extractConversationId = (data: unknown): string | undefined => {
  if (data && typeof data === 'object' && 'conversationId' in data) {
    const conversationId = (data as { conversationId?: unknown }).conversationId;
    if (typeof conversationId === 'string') {
      return conversationId;
    }
  }

  return undefined;
};

export const extractResponseText = (data: unknown): string => {
  if (typeof data === 'string') {
    return data;
  }

  if (!data || typeof data !== 'object') {
    return '';
  }

  const candidates = ['response', 'insight', 'message', 'answer'];

  for (const key of candidates) {
    const value = (data as Record<string, unknown>)[key];
    if (typeof value === 'string' && value.trim().length) {
      return value;
    }
  }

  return '';
};
