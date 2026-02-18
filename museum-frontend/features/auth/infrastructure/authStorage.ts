import { storage } from '@/shared/infrastructure/storage';

const TOKEN_KEY = 'userToken';

export const authStorage = {
  async getToken(): Promise<string | null> {
    return storage.getItem(TOKEN_KEY);
  },
  async setToken(token: string): Promise<void> {
    return storage.setItem(TOKEN_KEY, token);
  },
  async clearToken(): Promise<void> {
    return storage.removeItem(TOKEN_KEY);
  },
};
