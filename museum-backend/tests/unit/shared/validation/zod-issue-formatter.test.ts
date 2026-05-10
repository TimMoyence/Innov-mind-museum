/**
 * Unit tests for `formatZodIssue` / `formatZodIssues`.
 *
 * Targets the 10 Stryker mutants surviving on
 * `src/shared/validation/zod-issue.formatter.ts` (Survived + NoCoverage).
 *
 * Strategy: every assertion uses strict equality (`toBe`) on the full output
 * string so every branch return value and every embedded literal is
 * observed, leaving no room for empty-string / boolean-flip mutants to
 * silently survive.
 */

import type { z } from 'zod';

import { formatZodIssue, formatZodIssues } from '@shared/validation/zod-issue.formatter';

interface IssueShape {
  readonly path: readonly (string | number)[];
  readonly message: string;
}

/**
 * Builds a minimally-typed `ZodIssue`. The formatter only reads `path` and
 * `message`, so we cast through `unknown` to avoid pulling in the full
 * Zod-internal discriminated union (and to comply with the no-`as any`
 * pre-commit ratchet).
 * @param shape - The minimal `{ path, message }` projection the formatter consumes.
 * @returns A value typed as `z.ZodIssue` for direct injection into the formatter.
 */
const makeIssue = (shape: IssueShape): z.ZodIssue => shape as unknown as z.ZodIssue;

describe('formatZodIssue', () => {
  it('returns the fallback message when the issue is undefined', () => {
    // Kills 21:7 ConditionalExpression (`if (!issue)` → false) and
    // 21:22 StringLiteral ('Invalid payload' → '').
    expect(formatZodIssue(undefined)).toBe('Invalid payload');
  });

  it('returns the raw message when the path is empty (root error)', () => {
    // Kills 24:7 ConditionalExpression (`if (!path)` → false): a non-empty
    // message must be returned untouched when there is no path segment.
    const issue = makeIssue({ path: [], message: 'Payload must be an object' });
    expect(formatZodIssue(issue)).toBe('Payload must be an object');
  });

  it('prefixes the path when the message does not already embed it', () => {
    // Anchors the "happy path" return `${path} ${message}`. The mutated
    // `||` → `&&` form (25:7 LogicalOperator) would also reach this
    // branch, but the strict equality on the well-known prefix lets the
    // other targeted tests distinguish the two.
    const issue = makeIssue({ path: ['email'], message: 'is required' });
    expect(formatZodIssue(issue)).toBe('email is required');
  });

  it('does not double-prefix when the message starts with "<path> "', () => {
    // Kills:
    //   - 25:7 ConditionalExpression (`if (startsWith || startsWith)` → false)
    //   - 25:7 MethodExpression (`startsWith` → `endsWith` on first branch):
    //     the message does NOT end with `"email "`, so an endsWith
    //     replacement falls through to the prefixing branch and would
    //     yield `"email email must be a valid address"`.
    //   - 25:7 LogicalOperator (`||` → `&&`): with `&&`, the second
    //     `startsWith("email.")` is false → falls through to prefixing.
    const issue = makeIssue({
      path: ['email'],
      message: 'email must be a valid address',
    });
    expect(formatZodIssue(issue)).toBe('email must be a valid address');
  });

  it('does not double-prefix when the message starts with "<path>."', () => {
    // Kills 25:41 MethodExpression (`startsWith` → `endsWith` on the
    // second branch): the message does NOT end with `"email."`, so an
    // endsWith replacement would fall through and double-prefix.
    // Also reinforces the `||` → `&&` kill: with `&&`, the first
    // `startsWith("email ")` is false → falls through.
    const issue = makeIssue({
      path: ['email'],
      message: 'email.address must be provided',
    });
    expect(formatZodIssue(issue)).toBe('email.address must be provided');
  });

  it('joins multi-segment paths with "." before prefixing', () => {
    // Guards the `issue.path.map(String).join('.')` shape. Without this,
    // future mutations on the join separator would slip through.
    const issue = makeIssue({
      path: ['user', 0, 'email'],
      message: 'is required',
    });
    expect(formatZodIssue(issue)).toBe('user.0.email is required');
  });
});

describe('formatZodIssues', () => {
  it('returns the fallback message for an empty issue list', () => {
    // Kills 31:7 ConditionalExpression (`if (issues.length === 0)` → false)
    // and 31:35 StringLiteral ('Invalid payload' → '').
    expect(formatZodIssues([])).toBe('Invalid payload');
  });

  it('formats a single issue identically to formatZodIssue', () => {
    const issue = makeIssue({ path: ['email'], message: 'is required' });
    expect(formatZodIssues([issue])).toBe('email is required');
  });

  it('joins multiple formatted issues with ", "', () => {
    // Kills 32:52 StringLiteral (', ' → ''): asserting on the full joined
    // payload ensures the separator characters are observed.
    const issues = [
      makeIssue({ path: ['email'], message: 'is required' }),
      makeIssue({ path: ['password'], message: 'is too short' }),
    ];
    expect(formatZodIssues(issues)).toBe('email is required, password is too short');
  });
});
