import type { QuotaInfo } from '@/shared/types/quota-info';

export const makeQuotaReason = (overrides: Partial<QuotaInfo> = {}): QuotaInfo => ({
  tier: 'free',
  currentCount: 3,
  limit: 3,
  resetAt: '2026-12-01T00:00:00.000Z',
  ...overrides,
});
