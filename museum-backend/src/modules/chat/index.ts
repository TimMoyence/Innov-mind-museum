/**
 * Chat module barrel — lifecycle API.
 *
 * Builds and tears down the chat module singleton. For lazy runtime accessors
 * (getters used at request time), import from `@modules/chat/wiring`.
 */
import { getActiveChatModule } from './chat-module-singleton';

import type { BuiltChatModule } from './chat-module';
import type { OcrService } from './domain/ports/ocr.port';
import type { ChatService } from './useCase/chat.service';
import type { IMuseumRepository } from '@modules/museum/domain/museum.repository.interface';
import type { CacheService } from '@shared/cache/cache.port';
import type { DataSource } from 'typeorm';

export type { BuiltChatModule };

/** Wires the chat module and returns a configured ChatService. */
export const buildChatService = (
  dataSource: DataSource,
  cache?: CacheService,
  museumRepository?: IMuseumRepository,
): ChatService => getActiveChatModule().build(dataSource, cache, museumRepository).chatService;

/** Returns the shared OCR service instance. Throws if module is not built. */
export const getOcrService = (): OcrService => getActiveChatModule().getBuilt().ocrService;

/** Stops the periodic art-keywords refresh timer. Call during graceful shutdown. */
export const stopArtKeywordsRefresh = (): void => {
  getActiveChatModule().stopArtKeywordsRefresh();
};

/** Gracefully shuts down the knowledge extraction BullMQ worker. */
export const stopKnowledgeExtraction = async (): Promise<void> => {
  await getActiveChatModule().stopKnowledgeExtraction();
};
