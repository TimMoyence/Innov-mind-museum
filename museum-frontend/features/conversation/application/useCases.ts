import { conversationService } from '@/services/conversationService';
import { iaService } from '@/services/iaService';

import type { ChatMessage } from '../types';
import {
  extractConversationId,
  extractResponseText,
  mapToChatMessage,
} from '../domain/mappers';

export const fetchAllConversations = async () => {
  return conversationService.getAllConversations();
};

export const fetchConversationById = async (conversationId: string) => {
  return conversationService.getConversation(conversationId);
};

export const fetchLatestConversationMessages = async (): Promise<{
  conversationId: string | null;
  messages: ChatMessage[];
}> => {
  const conversations = await conversationService.getAllConversations();

  if (!conversations?.length) {
    return { conversationId: null, messages: [] };
  }

  const lastConversation = conversations[conversations.length - 1];
  const details = await conversationService.getConversation(lastConversation.id);

  const messages =
    details?.messages?.length
      ? details.messages.map(mapToChatMessage)
      : [];

  return { conversationId: lastConversation.id, messages };
};

export const analyzeArtworkImage = async (
  imageUri: string,
  conversationId?: string,
): Promise<{ conversationId?: string; responseText: string }> => {
  const analysisResult = await iaService.analyzeImage(
    imageUri,
    conversationId ?? undefined,
  );

  return {
    conversationId:
      extractConversationId(analysisResult) ?? conversationId ?? undefined,
    responseText: extractResponseText(analysisResult),
  };
};

export const askMuseumQuestion = async (
  question: string,
  artworkImageUri?: string,
  conversationId?: string,
): Promise<{ conversationId?: string; responseText: string }> => {
  const response = await iaService.askMuseumQuestion(
    question,
    artworkImageUri,
    conversationId ?? undefined,
  );

  let responseText = extractResponseText(response);

  if (!responseText && response && typeof response === 'object') {
    responseText = JSON.stringify(response);
  }

  return {
    conversationId:
      extractConversationId(response) ?? conversationId ?? undefined,
    responseText,
  };
};
