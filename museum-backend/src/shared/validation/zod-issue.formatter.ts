import type { z } from 'zod';

/**
 * Single source of truth for converting a Zod issue into a flat error string.
 *
 * Format:
 *   - Path empty (root object error) → raw message (e.g. `Payload must be an object`).
 *   - Message already starts with the path (schema author chose to embed it,
 *     e.g. `museumId must be a positive integer`) → raw message, no double-prefix.
 *   - Otherwise → `<path> <message>` so the field name is always reachable
 *     by callers asserting `expect(message).toContain('email')`.
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
  if (message.startsWith(`${path} `) || message.startsWith(`${path}.`)) return message;
  return `${path} ${message}`;
};

/** Joins multiple Zod issues into a comma-separated string for the AppError message. */
export const formatZodIssues = (issues: readonly z.ZodIssue[]): string => {
  if (issues.length === 0) return 'Invalid payload';
  return issues.map((i) => formatZodIssue(i)).join(', ');
};
