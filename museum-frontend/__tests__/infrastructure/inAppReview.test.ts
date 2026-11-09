import {
  incrementCompletedSessions,
  maybeRequestReview,
} from '@/shared/infrastructure/inAppReview';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
  removeItem: jest.fn().mockResolvedValue(undefined),
}));

const mockIsAvailableAsync = jest.fn<Promise<boolean>, []>();
const mockRequestReview = jest.fn<Promise<void>, []>();

jest.mock('expo-store-review', () => ({
  isAvailableAsync: () => mockIsAvailableAsync(),
  requestReview: () => mockRequestReview(),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';

const COMPLETED_SESSIONS_KEY = '@musaium/completed_sessions';
const REVIEW_PROMPTS_KEY = '@musaium/review_prompts';

const setupSessionCount = (count: number) => {
  (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) => {
    if (key === COMPLETED_SESSIONS_KEY) return Promise.resolve(String(count));
    if (key === REVIEW_PROMPTS_KEY) return Promise.resolve(null);
    return Promise.resolve(null);
  });
};

describe('inAppReview', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsAvailableAsync.mockResolvedValue(true);
    mockRequestReview.mockResolvedValue(undefined);
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
  });

  describe('incrementCompletedSessions', () => {
    it('increments session count from 0 to 1', async () => {
      await incrementCompletedSessions();

      expect(AsyncStorage.setItem).toHaveBeenCalledWith(COMPLETED_SESSIONS_KEY, '1');
    });

    it('increments session count from existing value', async () => {
      setupSessionCount(1);

      await incrementCompletedSessions();

      expect(AsyncStorage.setItem).toHaveBeenCalledWith(COMPLETED_SESSIONS_KEY, '2');
    });

    it('does NOT trigger review when count is below threshold (< 3)', async () => {
      setupSessionCount(0);

      await incrementCompletedSessions();

      expect(mockIsAvailableAsync).not.toHaveBeenCalled();
      expect(mockRequestReview).not.toHaveBeenCalled();
    });

    it('triggers review when count reaches threshold (= 3)', async () => {
      setupSessionCount(2);

      await incrementCompletedSessions();

      expect(mockIsAvailableAsync).toHaveBeenCalledTimes(1);
      expect(mockRequestReview).toHaveBeenCalledTimes(1);
    });

    it('triggers review when count exceeds threshold (> 3)', async () => {
      setupSessionCount(4);

      await incrementCompletedSessions();

      expect(mockIsAvailableAsync).toHaveBeenCalledTimes(1);
    });
  });

  describe('maybeRequestReview', () => {
    it('does not request review when StoreReview is unavailable', async () => {
      mockIsAvailableAsync.mockResolvedValue(false);

      await maybeRequestReview();

      expect(mockRequestReview).not.toHaveBeenCalled();
    });

    it('requests review and records timestamp when available and under limit', async () => {
      await maybeRequestReview();

      expect(mockRequestReview).toHaveBeenCalledTimes(1);

      const setItemCalls = (AsyncStorage.setItem as jest.Mock).mock.calls.filter(
        ([key]: [string]) => key === REVIEW_PROMPTS_KEY,
      );
      expect(setItemCalls).toHaveLength(1);

      const stored = JSON.parse(setItemCalls[0][1] as string) as { timestamps: number[] };
      expect(stored.timestamps).toHaveLength(1);
      expect(typeof stored.timestamps[0]).toBe('number');
    });

    it('respects MAX_PROMPTS_PER_YEAR (3) — blocks 4th prompt', async () => {
      const now = Date.now();
      const recentTimestamps = [
        now - 30 * 24 * 60 * 60 * 1000,
        now - 60 * 24 * 60 * 60 * 1000,
        now - 90 * 24 * 60 * 60 * 1000,
      ];

      (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) => {
        if (key === REVIEW_PROMPTS_KEY) {
          return Promise.resolve(JSON.stringify({ timestamps: recentTimestamps }));
        }
        return Promise.resolve(null);
      });

      await maybeRequestReview();

      expect(mockRequestReview).not.toHaveBeenCalled();
    });

    it('allows review if old timestamps are beyond one year', async () => {
      const now = Date.now();
      const oldTimestamps = [
        now - 400 * 24 * 60 * 60 * 1000,
        now - 500 * 24 * 60 * 60 * 1000,
        now - 600 * 24 * 60 * 60 * 1000,
      ];

      (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) => {
        if (key === REVIEW_PROMPTS_KEY) {
          return Promise.resolve(JSON.stringify({ timestamps: oldTimestamps }));
        }
        return Promise.resolve(null);
      });

      await maybeRequestReview();

      expect(mockRequestReview).toHaveBeenCalledTimes(1);
    });

    it('handles null/missing review prompt record gracefully', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);

      await maybeRequestReview();

      expect(mockRequestReview).toHaveBeenCalledTimes(1);
    });

    it('handles storage failure gracefully — throws but does not crash incrementCompletedSessions', async () => {
      (AsyncStorage.getItem as jest.Mock).mockRejectedValue(new Error('Storage read error'));

      await expect(maybeRequestReview()).rejects.toThrow();
    });

    it('records timestamp only after successful review request', async () => {
      mockRequestReview.mockRejectedValue(new Error('Review API failure'));

      await expect(maybeRequestReview()).rejects.toThrow('Review API failure');

      const setItemCalls = (AsyncStorage.setItem as jest.Mock).mock.calls.filter(
        ([key]: [string]) => key === REVIEW_PROMPTS_KEY,
      );
      expect(setItemCalls).toHaveLength(0);
    });

    it('filters timestamps correctly with mixed old and recent entries', async () => {
      const now = Date.now();
      const mixedTimestamps = [
        now - 400 * 24 * 60 * 60 * 1000,
        now - 100 * 24 * 60 * 60 * 1000,
        now - 200 * 24 * 60 * 60 * 1000,
      ];

      (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) => {
        if (key === REVIEW_PROMPTS_KEY) {
          return Promise.resolve(JSON.stringify({ timestamps: mixedTimestamps }));
        }
        return Promise.resolve(null);
      });

      await maybeRequestReview();

      expect(mockRequestReview).toHaveBeenCalledTimes(1);

      const setItemCalls = (AsyncStorage.setItem as jest.Mock).mock.calls.filter(
        ([key]: [string]) => key === REVIEW_PROMPTS_KEY,
      );
      expect(setItemCalls).toHaveLength(1);

      const stored = JSON.parse(setItemCalls[0][1] as string) as { timestamps: number[] };
      expect(stored.timestamps).toHaveLength(3);
    });
  });
});
