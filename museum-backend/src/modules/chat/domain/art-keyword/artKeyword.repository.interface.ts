import type { ArtKeyword } from './artKeyword.entity';

/** Port for persisting and querying crowdsourced art keywords. */
export interface ArtKeywordRepository {
  findByLocale(locale: string): Promise<ArtKeyword[]>;
  findByLocaleSince(locale: string, since: Date): Promise<ArtKeyword[]>;
  upsert(keyword: string, locale: string): Promise<ArtKeyword>;
  bulkUpsert(keywords: string[], locale: string): Promise<void>;
}
