import type { z } from 'zod';

export const formatZodIssue = (issue: z.core.$ZodIssue | undefined): string => {
  if (!issue) return 'Invalid payload';
  const path = issue.path.map(String).join('.');
  const { message } = issue;
  if (!path) return message;
  if (message.startsWith(`${path} `) || message.startsWith(`${path}.`)) return message;
  return `${path} ${message}`;
};

export const formatZodIssues = (issues: readonly z.core.$ZodIssue[]): string => {
  if (issues.length === 0) return 'Invalid payload';
  return issues.map((i) => formatZodIssue(i)).join(', ');
};
