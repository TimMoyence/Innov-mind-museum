import { User } from '@modules/auth/core/domain/user.entity';
import { AppDataSource } from '../../../../../data/db/data-source';
import { ImageInsightRepository } from '../../core/domain/imageInsight.repository.interface';
import { ImageInsightConversation } from '../../core/domain/imageInsightConversation.entity';
import { ImageInsightMessage } from '../../core/domain/imageInsightMessage.entity';

export const imageInsightRepositoryPg: ImageInsightRepository = {
  async saveMessages(userId, conversationId, imageUrl, messages) {
    const convRepo = AppDataSource.getRepository(ImageInsightConversation);
    const msgRepo = AppDataSource.getRepository(ImageInsightMessage);
    const userRepo = AppDataSource.getRepository(User);

    let conversation: ImageInsightConversation;

    if (conversationId) {
      conversation = await convRepo.findOneOrFail({
        where: { id: conversationId },
      });
    } else {
      const user = await userRepo.findOneByOrFail({ id: userId });
      conversation = new ImageInsightConversation();
      conversation.user = user;
      conversation.imageUrl = imageUrl || undefined;
      conversation.messages = [];
      await convRepo.save(conversation);
    }

    for (const msg of messages) {
      const message = msgRepo.create({
        role: msg.role,
        content: msg.content,
        conversation,
      });
      await msgRepo.save(message);
    }

    return await convRepo.findOneOrFail({
      where: { id: conversation.id },
      relations: ['messages'],
      order: { messages: { createdAt: 'ASC' } },
    });
  },
};
