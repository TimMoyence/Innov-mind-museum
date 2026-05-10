/**
 * Runtime accessor shims for the chat module singleton.
 * Import from here when you need lazy access to built services at request time
 * (e.g. api.router.ts, auth callbacks). For lifecycle management, use the
 * main barrel (`@modules/chat`).
 */
import { getActiveChatModule } from './chat-module-singleton';

import type { BuiltChatModule } from './chat-module';
import type { TypeOrmChatRepository } from '@modules/chat/adapters/secondary/persistence/chat.repository.typeorm';
import type { ArtKeywordRepository } from '@modules/chat/domain/art-keyword/artKeyword.repository.interface';
import type { ImageStorage } from '@modules/chat/domain/ports/image-storage.port';
import type { DescribeService } from '@modules/chat/useCase/describe/describe.service';
import type { UserMemoryService } from '@modules/chat/useCase/memory/user-memory.service';
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

/**
 * C3 Visual Similarity (T5.5 / Phase 6 corrective B1) — runtime accessor for the
 * partially-applied `compareImageUseCase` wired in {@link ChatModule.build}.
 *
 * The composition root in `api.router.ts` forwards this accessor's return value
 * as the 5th argument of `createChatRouter(...)`, which mounts the
 * `POST /chat/compare` sub-router only when the use-case is wired. Returning
 * `undefined` when the chat module is not yet built keeps the boot order
 * tolerant (mirrors {@link getDescribeService} / {@link getUserMemoryService}).
 */
export const getCompareImageUseCase = (): BuiltChatModule['compareImageUseCase'] =>
  getActiveChatModule().isBuilt() ? getActiveChatModule().getBuilt().compareImageUseCase : undefined;
