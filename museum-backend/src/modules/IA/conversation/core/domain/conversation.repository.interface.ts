import { ImageInsightConversation } from '@IA/imageInsight/core/domain/imageInsightConversation.entity';
import { ImageInsightMessage } from '@IA/imageInsight/core/domain/imageInsightMessage.entity';

export interface ConversationRepository {
  getConversationById(
    conversationId: string,
  ): Promise<ImageInsightConversation | null>;

  getAllConversationsByUserId(
    userId: string,
  ): Promise<ImageInsightConversation[]>;

  getAllConversations(): Promise<ImageInsightConversation[]>;

  addMessage(
    conversationId: string,
    message: ImageInsightMessage,
  ): Promise<void>;
}
