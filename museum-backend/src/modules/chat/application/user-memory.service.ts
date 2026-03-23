import { logger } from '@shared/logger/logger';
import type { CacheService } from '@shared/cache/cache.port';
import type { UserMemoryRepository, UserMemoryUpdates } from '../domain/userMemory.repository.interface';
import type { UserMemory } from '../domain/userMemory.entity';
import type { VisitContext } from '../domain/chat.types';
import type { NotableArtwork } from '../domain/userMemory.types';
import { buildUserMemoryPromptBlock } from './user-memory.prompt';

/** Array cap constants to prevent unbounded growth. */
const MAX_ARTISTS = 10;
const MAX_MUSEUMS = 10;
const MAX_ARTWORKS = 20;

const CACHE_TTL_SECONDS = 3600; // 1 hour
const CACHE_PREFIX = 'memory:prompt:';

/**
 * Application service for cross-session user memory.
 * Reads/writes user memory, builds prompt blocks, and manages cache invalidation.
 */
export class UserMemoryService {
  constructor(
    private readonly repository: UserMemoryRepository,
    private readonly cache?: CacheService,
  ) {}

  /**
   * Returns the prompt block for a user, reading from cache first.
   * Returns empty string if the user has no memory yet.
   */
  async getMemoryForPrompt(userId: number): Promise<string> {
    const cacheKey = `${CACHE_PREFIX}${userId}`;

    if (this.cache) {
      const cached = await this.cache.get<string>(cacheKey);
      if (cached !== null) return cached;
    }

    const memory = await this.repository.getByUserId(userId);
    const block = buildUserMemoryPromptBlock(memory);

    if (this.cache) {
      await this.cache.set(cacheKey, block, CACHE_TTL_SECONDS);
    }

    return block;
  }

  /**
   * Merges data from the completed session into the user's persistent memory.
   * Caps arrays to prevent unbounded growth.
   */
  async updateAfterSession(
    userId: number,
    visitContext: VisitContext | null | undefined,
    sessionId: string,
  ): Promise<void> {
    const existing = await this.repository.getByUserId(userId);

    const updates: UserMemoryUpdates = {
      sessionCount: (existing?.sessionCount ?? 0) + 1,
      lastSessionId: sessionId,
    };

    if (visitContext) {
      // Merge expertise
      if (visitContext.detectedExpertise && visitContext.expertiseSignals >= 3) {
        updates.preferredExpertise = visitContext.detectedExpertise;
      }

      // Merge museums visited
      if (visitContext.museumName) {
        const existingMuseums = existing?.museumsVisited ?? [];
        const lowerExisting = existingMuseums.map((m) => m.toLowerCase());
        if (!lowerExisting.includes(visitContext.museumName.toLowerCase())) {
          updates.museumsVisited = [...existingMuseums, visitContext.museumName].slice(-MAX_MUSEUMS);
        }
      }

      // Merge notable artworks
      if (visitContext.artworksDiscussed.length > 0) {
        const existingArtworks: NotableArtwork[] = existing?.notableArtworks ?? [];
        const newArtworks: NotableArtwork[] = visitContext.artworksDiscussed.map((a) => ({
          title: a.title,
          artist: a.artist,
          museum: visitContext.museumName ?? undefined,
          sessionId,
          discussedAt: a.discussedAt,
        }));
        updates.notableArtworks = [...existingArtworks, ...newArtworks].slice(-MAX_ARTWORKS);
        updates.totalArtworksDiscussed =
          (existing?.totalArtworksDiscussed ?? 0) + visitContext.artworksDiscussed.length;
      }

      // Merge favorite artists (unique, from discussed artworks)
      const newArtists = visitContext.artworksDiscussed
        .map((a) => a.artist)
        .filter((a): a is string => Boolean(a));
      if (newArtists.length > 0) {
        const existingArtists = existing?.favoriteArtists ?? [];
        const lowerExisting = existingArtists.map((a) => a.toLowerCase());
        const deduped = newArtists.filter((a) => !lowerExisting.includes(a.toLowerCase()));
        if (deduped.length > 0) {
          updates.favoriteArtists = [...existingArtists, ...deduped].slice(-MAX_ARTISTS);
        }
      }
    }

    try {
      await this.repository.upsert(userId, updates);
      await this.invalidateCache(userId);
    } catch (error) {
      // Fire-and-forget: log and swallow so memory failures never break the chat flow
      logger.warn('user_memory_update_failed', {
        userId,
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /** Hard-deletes the user's memory (GDPR erasure) and invalidates cache. */
  async deleteUserMemory(userId: number): Promise<void> {
    await this.repository.deleteByUserId(userId);
    await this.invalidateCache(userId);
  }

  /** Returns the raw entity for GDPR data export. */
  async getUserMemory(userId: number): Promise<UserMemory | null> {
    return this.repository.getByUserId(userId);
  }

  /** Invalidates cached prompt block for a user. */
  async invalidateCache(userId: number): Promise<void> {
    if (this.cache) {
      await this.cache.del(`${CACHE_PREFIX}${userId}`);
    }
  }
}
