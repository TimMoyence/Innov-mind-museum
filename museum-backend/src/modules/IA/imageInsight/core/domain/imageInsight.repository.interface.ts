import { ImageInsightConversation } from './imageInsightConversation.entity';

export interface ImageInsightRepository {
  saveMessages(
    userId: number,
    conversationId: string | null,
    imageUrl: string | null,
    messages: { role: 'user' | 'assistant'; content: string }[],
  ): Promise<ImageInsightConversation>;
}
