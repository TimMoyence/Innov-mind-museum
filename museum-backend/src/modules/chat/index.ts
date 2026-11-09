import { getActiveChatModule } from './chat-module';

import type { BuiltChatModule } from './chat-module';
import type { OcrService } from '@modules/chat/domain/ports/ocr.port';
import type { ChatService } from '@modules/chat/useCase/orchestration/chat.service';
import type { IMuseumRepository } from '@modules/museum/domain/museum/museum.repository.interface';
import type { CacheService } from '@shared/cache/cache.port';
import type { DataSource } from 'typeorm';

export type { BuiltChatModule };

export const buildChatService = (
  dataSource: DataSource,
  cache?: CacheService,
  museumRepository?: IMuseumRepository,
): ChatService => getActiveChatModule().build(dataSource, cache, museumRepository).chatService;

export const getOcrService = (): OcrService => getActiveChatModule().getBuilt().ocrService;

export const stopArtKeywordsRefresh = (): void => {
  getActiveChatModule().stopArtKeywordsRefresh();
};

export const stopKnowledgeExtraction = async (): Promise<void> => {
  await getActiveChatModule().stopKnowledgeExtraction();
};

export const stopWikidataBreaker = (): void => {
  getActiveChatModule().stopWikidataBreaker();
};
