import { errorMessage } from '@shared/errors/error-message';
import { logger } from '@shared/logger/logger';

import { buildUserMemoryPromptBlock } from './user-memory.prompt';

import type { VisitContext } from '@modules/chat/domain/chat.types';
import type { UserMemory } from '@modules/chat/domain/memory/userMemory.entity';
import type {
  RecentSessionAggregate,
  UserMemoryRepository,
  UserMemoryUpdates,
} from '@modules/chat/domain/memory/userMemory.repository.interface';
import type { NotableArtwork } from '@modules/chat/domain/memory/userMemory.types';
import type { ArtworkKnowledgeRepoPort } from '@modules/knowledge-extraction/domain/ports/artwork-knowledge-repo.port';
import type { CacheService } from '@shared/cache/cache.port';

const MAX_ARTISTS = 10;
const MAX_MUSEUMS = 10;
const MAX_ARTWORKS = 20;
const MAX_PERIODS = 10;

const RECENT_SESSIONS_LIMIT = 20;

const MIN_SESSIONS_FOR_P90 = 5;

const MAX_DURATION_MINUTES = 240;

const CACHE_TTL_SECONDS = 3600;
const CACHE_PREFIX = 'memory:prompt:';

const mergeExpertise = (updates: UserMemoryUpdates, visitContext: VisitContext): void => {
  if (visitContext.expertiseSignals >= 3) {
    updates.preferredExpertise = visitContext.detectedExpertise;
  }
};

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

export interface UserMemoryServiceOptionalDeps {
  artworkRepo?: ArtworkKnowledgeRepoPort;
}

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

  async updateAfterSession(
    userId: number,
    visitContext: VisitContext | null | undefined,
    sessionId: string,
    locale = 'en',
  ): Promise<void> {
    const existing = await this.repository.getByUserId(userId);
    const recentSessions = await this.repository.getRecentSessionsForUser(
      userId,
      RECENT_SESSIONS_LIMIT,
    );

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

    this.mergeLanguagePreference(updates, recentSessions, existing);
    this.mergeSessionDurationP90(updates, recentSessions, existing);

    try {
      await this.repository.upsert(userId, updates);
      await this.invalidateCache(userId);
    } catch (error) {
      logger.warn('user_memory_update_failed', {
        userId,
        sessionId,
        error: errorMessage(error),
      });
    }
  }

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
          error: errorMessage(err),
        });
      }
    }

    if (newPeriods.length === 0) return;
    updates.favoritePeriods = [...existingPeriods, ...newPeriods].slice(-MAX_PERIODS);
  }

  private mergeLanguagePreference(
    updates: UserMemoryUpdates,
    recentSessions: RecentSessionAggregate[],
    existing: UserMemory | null,
  ): void {
    if (recentSessions.length === 0) return;

    const tally = new Map<string, number>();
    for (const s of recentSessions) {
      if (s.locale === null) continue;
      tally.set(s.locale, (tally.get(s.locale) ?? 0) + 1);
    }

    if (tally.size === 0) return;

    let mode: string | null = null;
    for (const s of recentSessions) {
      if (s.locale !== null) {
        mode = s.locale;
        break;
      }
    }
    if (mode === null) return;

    let modeCount = tally.get(mode) ?? 0;
    for (const [locale, count] of tally) {
      if (count > modeCount) {
        mode = locale;
        modeCount = count;
      }
    }

    if (existing?.languagePreference === mode) return;
    updates.languagePreference = mode;
  }

  private mergeSessionDurationP90(
    updates: UserMemoryUpdates,
    recentSessions: RecentSessionAggregate[],
    existing: UserMemory | null,
  ): void {
    const durations: number[] = [];
    for (const s of recentSessions) {
      if (!s.lastMessageAt) continue;
      const ms = s.lastMessageAt.getTime() - s.createdAt.getTime();
      durations.push(Math.max(1, Math.round(ms / 60_000)));
    }

    if (durations.length < MIN_SESSIONS_FOR_P90) return;

    durations.sort((a, b) => a - b);
    const idx = Math.ceil(0.9 * durations.length) - 1;
    const p90 = Math.min(MAX_DURATION_MINUTES, durations[idx]);

    if (existing?.sessionDurationP90Minutes === p90) return;
    updates.sessionDurationP90Minutes = p90;
  }

  async deleteUserMemory(userId: number): Promise<void> {
    await this.repository.deleteByUserId(userId);
    await this.invalidateCache(userId);
  }

  async getUserMemory(userId: number): Promise<UserMemory | null> {
    return await this.repository.getByUserId(userId);
  }

  async setDisabledByUser(userId: number, disabled: boolean): Promise<void> {
    await this.repository.upsert(userId, { disabledByUser: disabled });
    await this.invalidateCache(userId);
  }

  async isDisabledByUser(userId: number): Promise<boolean> {
    const memory = await this.repository.getByUserId(userId);
    return memory?.disabledByUser ?? false;
  }

  async invalidateCache(userId: number): Promise<void> {
    if (this.cache) {
      await this.cache.del(`${CACHE_PREFIX}${String(userId)}`);
    }
  }
}
