/**
 * Chat module barrel — singleton + typed getter exports.
 *
 * The dependency graph and lifecycle logic live in {@link ./chat-module.ts}.
 * This file provides the public API surface for cross-module consumption.
 */
import { ChatModule } from './chat-module';

import type { TypeOrmChatRepository } from './adapters/secondary/chat.repository.typeorm';
import type { BuiltChatModule } from './chat-module';
import type { ArtKeywordRepository } from './domain/artKeyword.repository.interface';
import type { ImageStorage } from './domain/ports/image-storage.port';
import type { OcrService } from './domain/ports/ocr.port';
import type { ChatService } from './useCase/chat.service';
import type { DescribeService } from './useCase/describe.service';
import type { UserMemoryService } from './useCase/user-memory.service';
import type { IMuseumRepository } from '@modules/museum/domain/museum.repository.interface';
import type { CacheService } from '@shared/cache/cache.port';
import type { DataSource } from 'typeorm';

export type { BuiltChatModule };

// ── Module singleton ─────────────────────────────────────────────────────────

const chatModule = new ChatModule();

// ── Public API ───────────────────────────────────────────────────────────────

/** Wires the chat module and returns a configured ChatService. */
export const buildChatService = (
  dataSource: DataSource,
  cache?: CacheService,
  museumRepository?: IMuseumRepository,
): ChatService => chatModule.build(dataSource, cache, museumRepository).chatService;

/** Returns the shared image storage instance. Throws if module is not built. */
export const getImageStorage = (): ImageStorage => chatModule.getBuilt().imageStorage;

/** Returns the shared chat repository instance. Throws if module is not built. */
export const getChatRepository = (): TypeOrmChatRepository => chatModule.getBuilt().repository;

/** Returns the shared OCR service instance. Throws if module is not built. */
export const getOcrService = (): OcrService => chatModule.getBuilt().ocrService;

/** Returns the shared user memory service, or undefined if module is not yet built. */
export const getUserMemoryService = (): UserMemoryService | undefined =>
  chatModule.isBuilt() ? chatModule.getBuilt().userMemoryService : undefined;

/** Returns the shared art keyword repository, or undefined if module is not yet built. */
export const getArtKeywordRepository = (): ArtKeywordRepository | undefined =>
  chatModule.isBuilt() ? chatModule.getBuilt().artKeywordRepository : undefined;

/** Returns the shared describe service, or undefined if module is not yet built. */
export const getDescribeService = (): DescribeService | undefined =>
  chatModule.isBuilt() ? chatModule.getBuilt().describeService : undefined;

/** Returns the LLM circuit breaker state for the health endpoint. */
export const getLlmCircuitBreakerState = () => chatModule.getLlmCircuitBreakerState();

/** Stops the periodic art-keywords refresh timer. Call during graceful shutdown. */
export const stopArtKeywordsRefresh = () => {
  chatModule.stopArtKeywordsRefresh();
};

/** Gracefully shuts down the knowledge extraction BullMQ worker. */
export const stopKnowledgeExtraction = async () => {
  await chatModule.stopKnowledgeExtraction();
};
