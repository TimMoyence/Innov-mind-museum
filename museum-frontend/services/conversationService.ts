import { httpRequest } from './http';
import { CONVERSATION_ENDPOINTS, buildApiUrl } from './apiConfig';

export interface ConversationMessageDTO {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  createdAt?: string;
  timestamp?: string;
}

export interface ConversationDTO {
  id: string;
  imageUrl?: string | null;
  createdAt?: string;
  messages?: ConversationMessageDTO[];
  user?: {
    id?: string | number;
    firstname?: string;
  } | null;
}

export const conversationService = {
  async getConversation(conversationId: string): Promise<ConversationDTO> {
    return httpRequest<ConversationDTO>(
      buildApiUrl(CONVERSATION_ENDPOINTS.getById(conversationId)),
    );
  },

  async getAllConversations(): Promise<ConversationDTO[]> {
    return httpRequest<ConversationDTO[]>(
      buildApiUrl(CONVERSATION_ENDPOINTS.getAll),
    );
  },

  async getUserConversations(userId: string): Promise<ConversationDTO[]> {
    return httpRequest<ConversationDTO[]>(
      buildApiUrl(CONVERSATION_ENDPOINTS.getByUser(userId)),
    );
  },
};

export type ConversationService = typeof conversationService;
