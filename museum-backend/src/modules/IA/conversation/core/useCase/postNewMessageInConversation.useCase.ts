// core/useCase/postNewMessageInConversation.useCase.ts

import { ImageInsightMessage } from '@IA/imageInsight/core/domain/imageInsightMessage.entity';
import { IAService } from '../../adapters/secondary/conversation.IA';
import { ConversationRepository } from '../domain/conversation.repository.interface';

export class PostNewMessageInConversation {
  constructor(
    private readonly conversationRepository: ConversationRepository,
    private readonly iaService: IAService,
  ) {}

  async execute(
    conversationId: string,
    content: string,
    role: 'user' | 'assistant',
    tone: 'débutant' | 'expert' | 'confirmé',
    language: string,
  ) {
    const conversation = await this.conversationRepository.getConversationById(
      conversationId,
    );
    if (!conversation) {
      throw new Error('Conversation not found');
    }

    const userMessage = new ImageInsightMessage();
    userMessage.content = content;
    userMessage.role = role;

    await this.conversationRepository.addMessage(conversationId, userMessage);

    if (role === 'user') {
      const iaResponse = await this.iaService.generateResponse(
        conversation,
        tone,
        language,
      );
      const iaMessage = new ImageInsightMessage();
      iaMessage.content = iaResponse;
      iaMessage.role = 'assistant';

      await this.conversationRepository.addMessage(conversationId, iaMessage);
      return iaMessage;
    }

    return userMessage;
  }
}
