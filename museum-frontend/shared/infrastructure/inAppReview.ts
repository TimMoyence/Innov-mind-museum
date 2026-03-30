import * as StoreReview from 'expo-store-review';

import { storage } from './storage';

const COMPLETED_SESSIONS_KEY = '@musaium/completed_sessions';
const REVIEW_PROMPTS_KEY = '@musaium/review_prompts';

interface ReviewPromptRecord {
  timestamps: number[];
}

const MAX_PROMPTS_PER_YEAR = 3;
const SESSION_THRESHOLD = 3;

/** Increment the completed session counter and trigger a review prompt when the threshold is met. */
export const incrementCompletedSessions = async (): Promise<void> => {
  const raw = await storage.getItem(COMPLETED_SESSIONS_KEY);
  const count = raw ? parseInt(raw, 10) : 0;
  const next = count + 1;
  await storage.setItem(COMPLETED_SESSIONS_KEY, String(next));

  if (next >= SESSION_THRESHOLD) {
    await maybeRequestReview();
  }
};

/** Request an in-app review if Apple/Google guidelines allow it (max 3 prompts per year). */
export const maybeRequestReview = async (): Promise<void> => {
  const isAvailable = await StoreReview.isAvailableAsync();
  if (!isAvailable) return;

  const record = await storage.getJSON<ReviewPromptRecord>(REVIEW_PROMPTS_KEY);
  const now = Date.now();
  const oneYearAgo = now - 365 * 24 * 60 * 60 * 1000;

  const recentTimestamps = (record?.timestamps ?? []).filter((ts) => ts > oneYearAgo);

  if (recentTimestamps.length >= MAX_PROMPTS_PER_YEAR) return;

  await StoreReview.requestReview();

  recentTimestamps.push(now);
  await storage.setJSON(REVIEW_PROMPTS_KEY, { timestamps: recentTimestamps });
};
