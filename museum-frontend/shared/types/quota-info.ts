import type { components } from '@/shared/api/generated/openapi';

export type QuotaInfo = Pick<
  components['schemas']['QuotaExceededError'],
  'tier' | 'currentCount' | 'limit' | 'resetAt'
>;
