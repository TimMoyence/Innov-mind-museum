export type LlmPathTier = 'anonymous' | 'free';

export interface LlmJudgeScope {
  museumId?: number;
  tier?: LlmPathTier;
  requestId?: string;
}

export const deriveTier = (userId?: number | null): LlmPathTier =>
  userId == null ? 'anonymous' : 'free';
