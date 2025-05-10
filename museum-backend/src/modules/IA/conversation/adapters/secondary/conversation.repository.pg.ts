import { ImageInsightConversation } from '@IA/imageInsight/core/domain/imageInsightConversation.entity';
import { AppDataSource } from '../../../../../data/db/data-source';
import { ConversationRepository } from '../../core/domain/conversation.repository.interface';
import { ImageInsightMessage } from '@IA/imageInsight/core/domain/imageInsightMessage.entity';

export const conversationRepositoryPg: ConversationRepository = {
  async getConversationById(conversationId: string) {
    return await AppDataSource.getRepository(ImageInsightConversation)
      .createQueryBuilder('conversation')
      .leftJoinAndSelect('conversation.messages', 'messages')
      .leftJoin('conversation.user', 'user')
      .addSelect(['user.id', 'user.firstname'])
      .where('conversation.id = :id', { id: conversationId })
      .orderBy('messages.createdAt', 'ASC')
      .getOne();
  },

  async getAllConversationsByUserId(userId: string) {
    return await AppDataSource.getRepository(ImageInsightConversation)
      .createQueryBuilder('conversation')
      .leftJoinAndSelect('conversation.messages', 'messages')
      .leftJoin('conversation.user', 'user')
      .addSelect(['user.id', 'user.firstname'])
      .where('user.id = :userId', { userId })
      .orderBy('conversation.createdAt', 'ASC')
      .getMany();
  },

  async getAllConversations() {
    return await AppDataSource.getRepository(ImageInsightConversation)
      .createQueryBuilder('conversation')
      .leftJoinAndSelect('conversation.messages', 'messages')
      .leftJoin('conversation.user', 'user')
      .addSelect(['user.id', 'user.firstname'])
      .orderBy('conversation.createdAt', 'ASC')
      .getMany();
  },

  async addMessage(conversationId: string, message: ImageInsightMessage) {
    const conversation = await AppDataSource.getRepository(
      ImageInsightConversation,
    ).findOne({
      where: { id: conversationId },
    });

    if (!conversation) {
      throw new Error(`Conversation with ID ${conversationId} not found.`);
    }

    message.conversation = {
      id: conversation.id,
    } as ImageInsightConversation;

    const repository = AppDataSource.getRepository(ImageInsightMessage);
    await repository.save(message);
  },
};
