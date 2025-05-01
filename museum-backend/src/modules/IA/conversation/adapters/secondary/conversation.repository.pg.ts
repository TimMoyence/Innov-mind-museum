import { ImageInsightConversation } from '@IA/imageInsight/core/domain/imageInsightConversation.entity';
import { AppDataSource } from '../../../../../data/db/data-source';
import { ConversationRepository } from '../../core/domain/conversation.repository.interface';

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
};
