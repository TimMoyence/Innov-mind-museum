import type { z } from 'zod';

/**
 * Single source of truth for converting a Zod issue into a flat error string.
 *
 * Format: `<path> <message>` when the schema emitted a `must be …` message
 * (so callers see `museumId must be a positive integer`); the raw message
 * otherwise (when it already includes its full context, e.g. `coordinates
 * must be an object with lat and lng`).
 *
 * Used by both:
 *   - `validateBody` middleware (HTTP-boundary errors)
 *   - the legacy `parseCreateSessionRequest` / `parsePostMessageRequest`
 *     wrappers in `chat.contracts.ts`
 *
 * Any change to wire format must happen here so both code paths stay in sync.
 */
export const formatZodIssue = (issue: z.ZodIssue | undefined): string => {
  if (!issue) return 'Invalid payload';
  const path = issue.path.map(String).join('.');
  const { message } = issue;
  if (!path) return message;
  if (message.startsWith('must be ')) return `${path} ${message}`;
  return message;
};

/** Joins multiple Zod issues into a comma-separated string for the AppError message. */
export const formatZodIssues = (issues: readonly z.ZodIssue[]): string => {
  if (issues.length === 0) return 'Invalid payload';
  return issues.map((i) => formatZodIssue(i)).join(', ');
};
