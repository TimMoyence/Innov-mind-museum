import { ImageInsightConversation } from '@IA/imageInsight/core/domain/imageInsightConversation.entity';

export interface ConversationRepository {
  getConversationById(
    conversationId: string,
  ): Promise<ImageInsightConversation | null>;

  getAllConversationsByUserId(
    userId: string,
  ): Promise<ImageInsightConversation[]>;

  getAllConversations(): Promise<ImageInsightConversation[]>;
}
