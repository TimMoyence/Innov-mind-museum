/**
 * Runtime accessor shims for the chat module singleton.
 * Import from here when you need lazy access to built services at request time
 * (e.g. api.router.ts, auth callbacks). For lifecycle management, use the
 * main barrel (`@modules/chat`).
 */
import { getActiveChatModule } from './chat-module-singleton';

import type { TypeOrmChatRepository } from './adapters/secondary/chat.repository.typeorm';
import type { ArtKeywordRepository } from './domain/artKeyword.repository.interface';
import type { ImageStorage } from './domain/ports/image-storage.port';
import type { DescribeService } from './useCase/describe.service';
import type { UserMemoryService } from './useCase/user-memory.service';
import type { ArtworkKnowledgeRepoPort } from '@modules/knowledge-extraction/domain/ports/artwork-knowledge-repo.port';

export const getImageStorage = (): ImageStorage => getActiveChatModule().getBuilt().imageStorage;

export const getChatRepository = (): TypeOrmChatRepository =>
  getActiveChatModule().getBuilt().repository;

export const getUserMemoryService = (): UserMemoryService | undefined =>
  getActiveChatModule().isBuilt() ? getActiveChatModule().getBuilt().userMemoryService : undefined;

export const getArtKeywordRepository = (): ArtKeywordRepository | undefined =>
  getActiveChatModule().isBuilt()
    ? getActiveChatModule().getBuilt().artKeywordRepository
    : undefined;

export const getDescribeService = (): DescribeService | undefined =>
  getActiveChatModule().isBuilt() ? getActiveChatModule().getBuilt().describeService : undefined;

export const getLlmCircuitBreakerState = () => getActiveChatModule().getLlmCircuitBreakerState();

export const getArtworkKnowledgeRepo = (): ArtworkKnowledgeRepoPort | undefined =>
  getActiveChatModule().isBuilt()
    ? getActiveChatModule().getBuilt().artworkKnowledgeRepo
    : undefined;
