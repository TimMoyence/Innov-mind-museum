import { ConversationRepository } from '../domain/conversation.repository.interface';

export const getAllConversationsUseCase = (repo: ConversationRepository) => ({
  execute: () => repo.getAllConversations(),
});

export const getAllConversationsByUserIdUseCase = (
  repo: ConversationRepository,
) => ({
  execute: (userId: string) => repo.getAllConversationsByUserId(userId),
});

export const getConversationByIdUseCase = (repo: ConversationRepository) => ({
  execute: (conversationId: string) => repo.getConversationById(conversationId),
});
