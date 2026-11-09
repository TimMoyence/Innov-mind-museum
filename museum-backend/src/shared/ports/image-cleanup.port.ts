export type LegacyImageKeyFetcher = (userId: number) => Promise<string[]>;

export interface ImageCleanupPort {
  deleteByPrefix(userId: number | string, legacyFetcher?: LegacyImageKeyFetcher): Promise<void>;
}
