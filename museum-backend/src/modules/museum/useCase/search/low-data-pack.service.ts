import { logger } from '@shared/logger/logger';

import type { MuseumQaSeedRepository } from '../../domain/qa-seed/museumQaSeed.repository.interface';
import type { CacheService } from '@shared/cache/cache.port';

interface CachedEntry {
  originalText: string;
  locale: string;
  text: string;
  metadata?: Record<string, unknown>;
}

/**
 *
 */
export interface LowDataPackEntry {
  question: string;
  answer: string;
  metadata?: Record<string, unknown>;
  hits?: number;
  source: 'cache' | 'seeded';
}

/**
 *
 */
export interface LowDataPack {
  museumId: string;
  locale: string;
  generatedAt: string;
  entries: LowDataPackEntry[];
}

/** Assembles a low-data pack by merging popular cached answers with seeded Q&A entries. */
export class LowDataPackService {
  constructor(
    private readonly cache: CacheService,
    private readonly seedRepo: MuseumQaSeedRepository,
    private readonly maxEntries: number,
  ) {}

  /** Builds a low-data pack for the given museum and locale. */
  async getLowDataPack(museumId: string, locale: string): Promise<LowDataPack> {
    let cachedAnswers: LowDataPackEntry[] = [];

    try {
      const popular = await this.cache.ztop(`chat:llm:popular:${museumId}`, this.maxEntries);
      const resolved = await Promise.all(
        popular.map(async ({ member, score }): Promise<LowDataPackEntry | null> => {
          const value = await this.cache.get<CachedEntry>(member);
          if (value?.locale === locale) {
            return {
              question: value.originalText,
              answer: value.text,
              metadata: value.metadata,
              hits: score,
              source: 'cache' as const,
            };
          }
          return null;
        }),
      );
      cachedAnswers = resolved.filter((e): e is LowDataPackEntry => e !== null);
    } catch (error) {
      logger.warn('low_data_pack_cache_error', {
        museumId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    const seeded = await this.seedRepo.findByMuseumAndLocale(museumId, locale);
    const seededEntries: LowDataPackEntry[] = seeded.map((s) => ({
      question: s.question,
      answer: s.answer,
      metadata: s.metadata,
      source: 'seeded' as const,
    }));

    return {
      museumId,
      locale,
      generatedAt: new Date().toISOString(),
      entries: [...cachedAnswers, ...seededEntries],
    };
  }
}
