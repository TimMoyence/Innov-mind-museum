/**
 * Runtime accessor shims for the chat module singleton.
 * Import from here when you need lazy access to built services at request time
 * (e.g. api.router.ts, auth callbacks). For lifecycle management, use the
 * main barrel (`@modules/chat`).
 */
import { chatModule } from './chat-module-singleton';

import type { TypeOrmChatRepository } from './adapters/secondary/chat.repository.typeorm';
import type { ArtKeywordRepository } from './domain/artKeyword.repository.interface';
import type { ImageStorage } from './domain/ports/image-storage.port';
import type { DescribeService } from './useCase/describe.service';
import type { UserMemoryService } from './useCase/user-memory.service';
import type { ArtworkKnowledgeRepoPort } from '@modules/knowledge-extraction/domain/ports/artwork-knowledge-repo.port';

export const getImageStorage = (): ImageStorage => chatModule.getBuilt().imageStorage;

export const getChatRepository = (): TypeOrmChatRepository => chatModule.getBuilt().repository;

export const getUserMemoryService = (): UserMemoryService | undefined =>
  chatModule.isBuilt() ? chatModule.getBuilt().userMemoryService : undefined;

export const getArtKeywordRepository = (): ArtKeywordRepository | undefined =>
  chatModule.isBuilt() ? chatModule.getBuilt().artKeywordRepository : undefined;

export const getDescribeService = (): DescribeService | undefined =>
  chatModule.isBuilt() ? chatModule.getBuilt().describeService : undefined;

export const getLlmCircuitBreakerState = () => chatModule.getLlmCircuitBreakerState();

export const getArtworkKnowledgeRepo = (): ArtworkKnowledgeRepoPort | undefined =>
  chatModule.isBuilt() ? chatModule.getBuilt().artworkKnowledgeRepo : undefined;
