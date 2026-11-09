import { runAuthRefresh, type AuthRefreshResult } from '@/shared/infrastructure/httpClient';

export type { AuthRefreshResult };

export const authSessionService = {
  async refresh(): Promise<AuthRefreshResult> {
    return runAuthRefresh();
  },
};
