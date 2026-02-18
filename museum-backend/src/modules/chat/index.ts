import { DataSource } from 'typeorm';

import { ChatService } from './application/chat.service';
import { LangChainChatOrchestrator } from './adapters/secondary/langchain.orchestrator';
import { LocalImageStorage } from './adapters/secondary/image-storage.stub';
import { TypeOrmChatRepository } from './infrastructure/chat.repository.typeorm';

export const buildChatService = (dataSource: DataSource): ChatService => {
  return new ChatService(
    new TypeOrmChatRepository(dataSource),
    new LangChainChatOrchestrator(),
    new LocalImageStorage(),
  );
};
