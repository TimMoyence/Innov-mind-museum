import type { z } from 'zod';

/**
 * Single source of truth for Zod issue → flat error string. Wire-format
 * change MUST happen here (validateBody + chat.contracts.ts wrappers).
 *
 * Format:
 *   - Empty path (root error) → raw message.
 *   - Message starts with path → raw (no double-prefix).
 *   - Otherwise → `<path> <message>` so field name reachable for
 *     `expect(message).toContain('email')` assertions.
 */
export const formatZodIssue = (issue: z.core.$ZodIssue | undefined): string => {
  if (!issue) return 'Invalid payload';
  const path = issue.path.map(String).join('.');
  const { message } = issue;
  if (!path) return message;
  if (message.startsWith(`${path} `) || message.startsWith(`${path}.`)) return message;
  return `${path} ${message}`;
};

/** Comma-joins issues for AppError message. */
export const formatZodIssues = (issues: readonly z.core.$ZodIssue[]): string => {
  if (issues.length === 0) return 'Invalid payload';
  return issues.map((i) => formatZodIssue(i)).join(', ');
};
