import type { z } from 'zod';

import { formatZodIssue, formatZodIssues } from '@shared/validation/zod-issue.formatter';

interface IssueShape {
  readonly path: readonly (string | number)[];
  readonly message: string;
}

const makeIssue = (shape: IssueShape): z.ZodIssue => shape as unknown as z.ZodIssue;

describe('formatZodIssue', () => {
  it('returns the fallback message when the issue is undefined', () => {
    expect(formatZodIssue(undefined)).toBe('Invalid payload');
  });

  it('returns the raw message when the path is empty (root error)', () => {
    const issue = makeIssue({ path: [], message: 'Payload must be an object' });
    expect(formatZodIssue(issue)).toBe('Payload must be an object');
  });

  it('prefixes the path when the message does not already embed it', () => {
    const issue = makeIssue({ path: ['email'], message: 'is required' });
    expect(formatZodIssue(issue)).toBe('email is required');
  });

  it('does not double-prefix when the message starts with "<path> "', () => {
    const issue = makeIssue({
      path: ['email'],
      message: 'email must be a valid address',
    });
    expect(formatZodIssue(issue)).toBe('email must be a valid address');
  });

  it('does not double-prefix when the message starts with "<path>."', () => {
    const issue = makeIssue({
      path: ['email'],
      message: 'email.address must be provided',
    });
    expect(formatZodIssue(issue)).toBe('email.address must be provided');
  });

  it('joins multi-segment paths with "." before prefixing', () => {
    const issue = makeIssue({
      path: ['user', 0, 'email'],
      message: 'is required',
    });
    expect(formatZodIssue(issue)).toBe('user.0.email is required');
  });
});

describe('formatZodIssues', () => {
  it('returns the fallback message for an empty issue list', () => {
    expect(formatZodIssues([])).toBe('Invalid payload');
  });

  it('formats a single issue identically to formatZodIssue', () => {
    const issue = makeIssue({ path: ['email'], message: 'is required' });
    expect(formatZodIssues([issue])).toBe('email is required');
  });

  it('joins multiple formatted issues with ", "', () => {
    const issues = [
      makeIssue({ path: ['email'], message: 'is required' }),
      makeIssue({ path: ['password'], message: 'is too short' }),
    ];
    expect(formatZodIssues(issues)).toBe('email is required, password is too short');
  });
});
