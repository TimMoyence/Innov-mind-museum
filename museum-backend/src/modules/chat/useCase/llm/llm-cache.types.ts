export type LlmContextClass = 'generic' | 'museum-mode' | 'personalized';

export interface LlmCacheKeyInput {
  model: string;
  userId: number | 'anon';
  systemSection: string;
  locale: string;
  museumContext?: { museumId?: number | null; museumName?: string | null };
  userPreferencesHash?: string;
  prompt: string;
  imageContentHash?: string;
  readonly voiceMode?: boolean;
  readonly audioDescriptionMode?: boolean;
  readonly currentArtworkKey?: string;
  readonly lowDataMode?: boolean;
}

export interface LlmCacheLookupResult<T> {
  hit: boolean;
  value: T | null;
  contextClass: LlmContextClass;
}

export interface LlmCacheService {
  classify(input: LlmCacheKeyInput): LlmContextClass;
  computeKey(input: LlmCacheKeyInput): string;
  lookup<T>(input: LlmCacheKeyInput): Promise<LlmCacheLookupResult<T>>;
  store(input: LlmCacheKeyInput, value: unknown): Promise<void>;
  invalidateMuseum(museumId: number): Promise<void>;
}
