import { logger } from '@shared/logger/logger';

import { buildUserMemoryPromptBlock } from './user-memory.prompt';

import type { VisitContext } from '../domain/chat.types';
import type { UserMemory } from '../domain/userMemory.entity';
import type {
  UserMemoryRepository,
  UserMemoryUpdates,
} from '../domain/userMemory.repository.interface';
import type { NotableArtwork } from '../domain/userMemory.types';
import type { ArtworkKnowledgeRepoPort } from '@modules/knowledge-extraction/domain/ports/artwork-knowledge-repo.port';
import type { CacheService } from '@shared/cache/cache.port';

/** Array cap constants to prevent unbounded growth. */
const MAX_ARTISTS = 10;
const MAX_MUSEUMS = 10;
const MAX_ARTWORKS = 20;
const MAX_PERIODS = 10;

const CACHE_TTL_SECONDS = 3600; // 1 hour
const CACHE_PREFIX = 'memory:prompt:';

/** Merges preferred expertise from the visit context if enough signals were observed. */
const mergeExpertise = (updates: UserMemoryUpdates, visitContext: VisitContext): void => {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- defensive: detectedExpertise may be empty string at runtime
  if (visitContext.detectedExpertise && visitContext.expertiseSignals >= 3) {
    updates.preferredExpertise = visitContext.detectedExpertise;
  }
};

/** Appends a new museum to the visited list if not already present, capped at MAX_MUSEUMS. */
const mergeMuseums = (
  updates: UserMemoryUpdates,
  existing: UserMemory | null,
  museumName: string | undefined,
): void => {
  if (!museumName) return;
  const existingMuseums = existing?.museumsVisited ?? [];
  const lowerExisting = existingMuseums.map((m) => m.toLowerCase());
  if (!lowerExisting.includes(museumName.toLowerCase())) {
    updates.museumsVisited = [...existingMuseums, museumName].slice(-MAX_MUSEUMS);
  }
};

/** Merges artworks discussed in this session into the persistent notable artworks list. */
const mergeArtworks = (
  updates: UserMemoryUpdates,
  existing: UserMemory | null,
  visitContext: VisitContext,
  sessionId: string,
): void => {
  if (visitContext.artworksDiscussed.length === 0) return;
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
};

/** Merges unique artist names from discussed artworks, capped at MAX_ARTISTS. */
const mergeArtists = (
  updates: UserMemoryUpdates,
  existing: UserMemory | null,
  visitContext: VisitContext,
): void => {
  const newArtists = visitContext.artworksDiscussed
    .map((a) => a.artist)
    .filter((a): a is string => Boolean(a));
  if (newArtists.length === 0) return;
  const existingArtists = existing?.favoriteArtists ?? [];
  const lowerExisting = existingArtists.map((a) => a.toLowerCase());
  const deduped = newArtists.filter((a) => !lowerExisting.includes(a.toLowerCase()));
  if (deduped.length > 0) {
    updates.favoriteArtists = [...existingArtists, ...deduped].slice(-MAX_ARTISTS);
  }
};

/**
 * Optional dependencies for {@link UserMemoryService}. Kept as a separate
 * options bag (rather than additional positional ctor args) so future Spec C
 * mergers can add ports here without breaking existing call sites.
 */
export interface UserMemoryServiceOptionalDeps {
  /**
   * Knowledge-extraction port. When supplied, {@link UserMemoryService.updateAfterSession}
   * looks up the `period` for each discussed artwork and merges new entries
   * into `UserMemory.favoritePeriods`.
   */
  artworkRepo?: ArtworkKnowledgeRepoPort;
}

/**
 * Application service for cross-session user memory.
 * Reads/writes user memory, builds prompt blocks, and manages cache invalidation.
 */
export class UserMemoryService {
  private readonly repository: UserMemoryRepository;
  private readonly cache?: CacheService;
  private readonly artworkRepo?: ArtworkKnowledgeRepoPort;

  constructor(
    repository: UserMemoryRepository,
    cache?: CacheService,
    optional?: UserMemoryServiceOptionalDeps,
  ) {
    this.repository = repository;
    this.cache = cache;
    this.artworkRepo = optional?.artworkRepo;
  }

  /**
   * Returns the prompt block for a user, reading from cache first.
   * Returns empty string if the user has no memory yet.
   */
  async getMemoryForPrompt(userId: number): Promise<string> {
    const cacheKey = `${CACHE_PREFIX}${String(userId)}`;

    if (this.cache) {
      const cached = await this.cache.get<string>(cacheKey);
      if (cached !== null) return cached;
    }

    const memory = await this.repository.getByUserId(userId);
    if (memory?.disabledByUser) return '';
    const block = buildUserMemoryPromptBlock(memory);

    if (this.cache) {
      await this.cache.set(cacheKey, block, CACHE_TTL_SECONDS);
    }

    return block;
  }

  /**
   * Merges data from the completed session into the user's persistent memory.
   * Caps arrays to prevent unbounded growth.
   *
   * @param userId - Owner of the memory row.
   * @param visitContext - Aggregated session signals (museum, artworks, expertise).
   * @param sessionId - Source session id (recorded as `lastSessionId`).
   * @param locale - Session locale used for artwork-knowledge lookups
   *   (defaults to `'en'` so existing call sites keep working).
   */
  async updateAfterSession(
    userId: number,
    visitContext: VisitContext | null | undefined,
    sessionId: string,
    locale = 'en',
  ): Promise<void> {
    const existing = await this.repository.getByUserId(userId);

    const updates: UserMemoryUpdates = {
      sessionCount: (existing?.sessionCount ?? 0) + 1,
      lastSessionId: sessionId,
    };

    if (visitContext) {
      mergeExpertise(updates, visitContext);
      mergeMuseums(updates, existing, visitContext.museumName);
      mergeArtworks(updates, existing, visitContext, sessionId);
      mergeArtists(updates, existing, visitContext);
      await this.mergePeriods(updates, existing, visitContext, locale);
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

  /**
   * Merges new {@link ArtworkKnowledge.period} values from artworks discussed
   * in the session onto `UserMemory.favoritePeriods`.
   *
   * - Skipped entirely when no artworkRepo was injected, or when no artworks
   *   were discussed (cheap early return — no DB hit).
   * - Dedupe is case-insensitive against the existing list AND across the
   *   current batch (so two artworks of the same period in one session yield
   *   a single new entry).
   * - Lookup failures are logged and skipped per-title so a single network
   *   blip can't lose the whole batch.
   * - Capped at {@link MAX_PERIODS} keeping the most recent entries (slice(-N)).
   */
  private async mergePeriods(
    updates: UserMemoryUpdates,
    existing: UserMemory | null,
    visitContext: VisitContext,
    locale: string,
  ): Promise<void> {
    if (!this.artworkRepo) return;
    if (visitContext.artworksDiscussed.length === 0) return;

    const existingPeriods = existing?.favoritePeriods ?? [];
    const lowerExisting = new Set(existingPeriods.map((p) => p.toLowerCase()));
    const newPeriods: string[] = [];

    for (const a of visitContext.artworksDiscussed) {
      try {
        const knowledge = await this.artworkRepo.findByTitleAndLocale(a.title, locale);
        const period = knowledge?.period?.trim();
        if (!period) continue;
        const lower = period.toLowerCase();
        if (lowerExisting.has(lower)) continue;
        lowerExisting.add(lower);
        newPeriods.push(period);
      } catch (err) {
        logger.warn('user_memory_period_lookup_failed', {
          title: a.title,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (newPeriods.length === 0) return;
    updates.favoritePeriods = [...existingPeriods, ...newPeriods].slice(-MAX_PERIODS);
  }

  /** Hard-deletes the user's memory (GDPR erasure) and invalidates cache. */
  async deleteUserMemory(userId: number): Promise<void> {
    await this.repository.deleteByUserId(userId);
    await this.invalidateCache(userId);
  }

  /** Returns the raw entity for GDPR data export. */
  async getUserMemory(userId: number): Promise<UserMemory | null> {
    return await this.repository.getByUserId(userId);
  }

  /** Sets or clears the user's opt-out flag for memory-powered personalisation. */
  async setDisabledByUser(userId: number, disabled: boolean): Promise<void> {
    await this.repository.upsert(userId, { disabledByUser: disabled });
    await this.invalidateCache(userId);
  }

  /** Returns whether the user has opted out of memory-powered personalisation. */
  async isDisabledByUser(userId: number): Promise<boolean> {
    const memory = await this.repository.getByUserId(userId);
    return memory?.disabledByUser ?? false;
  }

  /** Invalidates cached prompt block for a user. */
  async invalidateCache(userId: number): Promise<void> {
    if (this.cache) {
      await this.cache.del(`${CACHE_PREFIX}${String(userId)}`);
    }
  }
}
