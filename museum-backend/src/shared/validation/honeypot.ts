import { z } from 'zod';

export const HUMAN_FILL_MS_MIN = 5_000;

export const honeypotField = z.string().max(500).optional();

export const fillMsField = z.number().int().min(0).optional();

export type SubmissionVerdict = 'bot' | 'suspect' | 'clean';

export function judgeSubmission(signals: { website?: string; fillMs?: number }): SubmissionVerdict {
  const trapped = typeof signals.website === 'string' && signals.website.trim().length > 0;
  const fast = signals.fillMs === undefined || signals.fillMs < HUMAN_FILL_MS_MIN;
  if (trapped && fast) return 'bot';
  return trapped || fast ? 'suspect' : 'clean';
}
