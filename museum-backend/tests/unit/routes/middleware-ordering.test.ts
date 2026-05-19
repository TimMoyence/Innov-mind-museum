/**
 * T1.6 / R7 + R10 — Failing unit test: validateBody must appear BEFORE
 * body-keyed rate-limit middleware in every affected route.
 *
 * spec.md §3.2 R7:
 *   "The system shall mount validateBody(zodSchema) BEFORE the per-account-keyed
 *   express-rate-limit middleware on every route in §3.2 site list."
 *
 * spec.md §3.2 R10:
 *   "The system shall keep isAuthenticated BEFORE limiters that key off
 *   req.user (e.g. userLimiter at chat-message/chat-media/chat-compare) —
 *   current ordering is correct and must be preserved."
 *
 * design.md §D7:
 *   Unit test reads the route source file as a string and asserts the
 *   relative position of validateBody(...) vs the named limiter identifier
 *   in the registered middleware array.
 *
 * design.md §D4 — correct mount order for a body-keyed rate-limited POST:
 *   1. (optional) IP-keyed limiter — before validateBody, protects validator
 *   2. validateBody(zodSchema) — 400 short-circuits before counter mutates
 *   3. (optional) isAuthenticated — required if (4) keys off req.user
 *   4. body-keyed / user-keyed rate-limit middleware
 *   5. handler
 *
 * RED state (tasks.md T1.6):
 *   Auth + MFA assertions FAIL today:
 *     - auth-session.route.ts: loginByAccountLimiter / refreshLimiter /
 *       socialLoginLimiter all appear BEFORE validateBody.
 *     - mfa.route.ts: challengeLimiter / recoveryLimiter appear BEFORE
 *       validateBody.
 *   Chat assertions PASS today (isAuthenticated < userLimiter — regression guard).
 *
 * Frozen-test invariant: this file is immutable byte-for-byte once committed.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Route file paths (relative to this test file)
// ---------------------------------------------------------------------------
const ROUTES_ROOT = path.resolve(__dirname, '../../../src/modules');

const AUTH_SESSION_ROUTE = path.join(
  ROUTES_ROOT,
  'auth/adapters/primary/http/routes/auth-session.route.ts',
);
const MFA_ROUTE = path.join(ROUTES_ROOT, 'auth/adapters/primary/http/routes/mfa.route.ts');
const CHAT_MESSAGE_ROUTE = path.join(
  ROUTES_ROOT,
  'chat/adapters/primary/http/routes/chat-message.route.ts',
);
const CHAT_MEDIA_ROUTE = path.join(
  ROUTES_ROOT,
  'chat/adapters/primary/http/routes/chat-media.route.ts',
);
const CHAT_COMPARE_ROUTE = path.join(
  ROUTES_ROOT,
  'chat/adapters/primary/http/routes/chat-compare.route.ts',
);

// ---------------------------------------------------------------------------
// Helper: find the index of the FIRST occurrence of a pattern within a
// slice of source, anchored to a route-block start.
// Returns -1 if not found.
// ---------------------------------------------------------------------------
function indexInBlock(block: string, pattern: string | RegExp): number {
  if (typeof pattern === 'string') {
    return block.indexOf(pattern);
  }
  const match = pattern.exec(block);
  return match ? match.index : -1;
}

/**
 * Extract the route block starting at the first `router.post(` that contains
 * the given route-path literal (e.g. `'/login'`). The block ends at the
 * closing `)` of the outermost router.post call — approximated by finding
 * the next `router.post(` or `router.get(` or `mfaRouter.post(` after the
 * opening, or end of file.
 * @param source
 * @param routePath
 */
function extractRouteBlock(source: string, routePath: string): string {
  // Match router.post( or mfaRouter.post( etc. followed by the path literal
  const openPattern = new RegExp(
    `(?:router|authSessionRouter|mfaRouter)\\.post\\(\\s*['"]${routePath}['"]`,
  );
  const startMatch = openPattern.exec(source);
  if (!startMatch) return '';

  const start = startMatch.index;
  // Find the next route registration or end of file to bound the block
  const afterStart = source.slice(start + 1);
  const nextRouteMatch = /(?:router|authSessionRouter|mfaRouter)\.[a-z]+\(/.exec(afterStart);
  const end = nextRouteMatch ? start + 1 + nextRouteMatch.index : source.length;

  return source.slice(start, end);
}

// ---------------------------------------------------------------------------
// auth-session.route.ts assertions
// ---------------------------------------------------------------------------

describe('R7 — auth-session.route.ts: validateBody BEFORE body-keyed limiters', () => {
  let source: string;

  beforeAll(() => {
    source = readFileSync(AUTH_SESSION_ROUTE, 'utf-8');
  });

  /**
   * R7.1 — POST /login:
   *   Correct order: loginLimiter (IP) → validateBody → loginByAccountLimiter (body.email)
   *   TODAY FAILS: loginByAccountLimiter appears at index 103 BEFORE validateBody at line 105
   */
  it("R7.1 — POST '/login': validateBody appears BEFORE loginByAccountLimiter", () => {
    const block = extractRouteBlock(source, '/login');
    expect(block).not.toBe('');

    const validateIdx = indexInBlock(block, 'validateBody(loginSchema)');
    const accountLimiterIdx = indexInBlock(block, 'loginByAccountLimiter');

    expect(validateIdx).toBeGreaterThanOrEqual(0);
    expect(accountLimiterIdx).toBeGreaterThanOrEqual(0);

    // FAILS today: accountLimiterIdx < validateIdx (limiter is before validateBody)
    expect(validateIdx).toBeLessThan(accountLimiterIdx);
  });

  /**
   * R7.1b — POST /login: IP-keyed loginLimiter must remain BEFORE validateBody
   * (design.md §D4 rule: IP-keyed limiter protects validator from CPU exhaustion).
   * PASSES today and after green — this is the preserved ordering.
   */
  it("R7.1b — POST '/login': loginLimiter (IP-keyed) stays BEFORE validateBody (D4 rule)", () => {
    const block = extractRouteBlock(source, '/login');
    expect(block).not.toBe('');

    const loginLimiterIdx = indexInBlock(block, 'loginLimiter,');
    const validateIdx = indexInBlock(block, 'validateBody(loginSchema)');

    expect(loginLimiterIdx).toBeGreaterThanOrEqual(0);
    expect(validateIdx).toBeGreaterThanOrEqual(0);

    // loginLimiter (IP-keyed) must be BEFORE validateBody — design D4
    expect(loginLimiterIdx).toBeLessThan(validateIdx);
  });

  /**
   * R7.2 — POST /refresh:
   *   Correct order: validateBody → refreshLimiter
   *   TODAY FAILS: refreshLimiter appears BEFORE validateBody
   */
  it("R7.2 — POST '/refresh': validateBody appears BEFORE refreshLimiter", () => {
    const block = extractRouteBlock(source, '/refresh');
    expect(block).not.toBe('');

    const validateIdx = indexInBlock(block, 'validateBody(refreshSchema)');
    const refreshLimiterIdx = indexInBlock(block, 'refreshLimiter');

    expect(validateIdx).toBeGreaterThanOrEqual(0);
    expect(refreshLimiterIdx).toBeGreaterThanOrEqual(0);

    // FAILS today: refreshLimiterIdx < validateIdx
    expect(validateIdx).toBeLessThan(refreshLimiterIdx);
  });

  /**
   * R7.3 — POST /social-login:
   *   Correct order: validateBody → socialLoginLimiter
   *   TODAY FAILS: socialLoginLimiter appears BEFORE validateBody
   */
  it("R7.3 — POST '/social-login': validateBody appears BEFORE socialLoginLimiter", () => {
    const block = extractRouteBlock(source, '/social-login');
    expect(block).not.toBe('');

    const validateIdx = indexInBlock(block, 'validateBody(socialLoginSchema)');
    const socialLimiterIdx = indexInBlock(block, 'socialLoginLimiter');

    expect(validateIdx).toBeGreaterThanOrEqual(0);
    expect(socialLimiterIdx).toBeGreaterThanOrEqual(0);

    // FAILS today: socialLimiterIdx < validateIdx
    expect(validateIdx).toBeLessThan(socialLimiterIdx);
  });

  /**
   * R7.3b — POST /social-redeem (auth-session.route.ts:199):
   *   Correct order: validateBody(socialRedeemSchema) → socialLoginLimiter
   *   TODAY FAILS: socialLoginLimiter appears BEFORE validateBody
   *
   *   Scope reconciliation (red-respawn-context.md §Scope reconciliation):
   *   The first GREEN editor flagged that the ordering ast-grep rule fires on
   *   /social-redeem because it uses socialLoginLimiter (same as /social-login).
   *   The architect plan counted 5 body-keyed sites; the real scope is 6.
   *   This is site #4 in the reconciled 6-site list.
   */
  it("R7.3b — POST '/social-redeem': validateBody appears BEFORE socialLoginLimiter", () => {
    const block = extractRouteBlock(source, '/social-redeem');
    expect(block).not.toBe('');

    const validateIdx = indexInBlock(block, 'validateBody(socialRedeemSchema)');
    const socialLimiterIdx = indexInBlock(block, 'socialLoginLimiter');

    expect(validateIdx).toBeGreaterThanOrEqual(0);
    expect(socialLimiterIdx).toBeGreaterThanOrEqual(0);

    // FAILS today: socialLimiterIdx < validateIdx
    expect(validateIdx).toBeLessThan(socialLimiterIdx);
  });
});

// ---------------------------------------------------------------------------
// mfa.route.ts assertions
// ---------------------------------------------------------------------------

describe('R7 — mfa.route.ts: validateBody BEFORE body-keyed limiters', () => {
  let source: string;

  beforeAll(() => {
    source = readFileSync(MFA_ROUTE, 'utf-8');
  });

  /**
   * R7.4 — POST /challenge:
   *   Correct order: validateBody → challengeLimiter
   *   TODAY FAILS: challengeLimiter appears BEFORE validateBody
   */
  it("R7.4 — POST '/challenge': validateBody appears BEFORE challengeLimiter", () => {
    const block = extractRouteBlock(source, '/challenge');
    expect(block).not.toBe('');

    const validateIdx = indexInBlock(block, 'validateBody(challengeSchema)');
    const challengeLimiterIdx = indexInBlock(block, 'challengeLimiter');

    expect(validateIdx).toBeGreaterThanOrEqual(0);
    expect(challengeLimiterIdx).toBeGreaterThanOrEqual(0);

    // FAILS today: challengeLimiterIdx < validateIdx
    expect(validateIdx).toBeLessThan(challengeLimiterIdx);
  });

  /**
   * R7.5 — POST /recovery:
   *   Correct order: validateBody → recoveryLimiter
   *   TODAY FAILS: recoveryLimiter appears BEFORE validateBody
   */
  it("R7.5 — POST '/recovery': validateBody appears BEFORE recoveryLimiter", () => {
    const block = extractRouteBlock(source, '/recovery');
    expect(block).not.toBe('');

    const validateIdx = indexInBlock(block, 'validateBody(recoverySchema)');
    const recoveryLimiterIdx = indexInBlock(block, 'recoveryLimiter');

    expect(validateIdx).toBeGreaterThanOrEqual(0);
    expect(recoveryLimiterIdx).toBeGreaterThanOrEqual(0);

    // FAILS today: recoveryLimiterIdx < validateIdx
    expect(validateIdx).toBeLessThan(recoveryLimiterIdx);
  });
});

// ---------------------------------------------------------------------------
// R10 — Chat routes: isAuthenticated BEFORE userLimiter (regression guard)
// PASS today. Guards that reordering auth routes doesn't accidentally
// break chat route ordering.
// ---------------------------------------------------------------------------

describe('R10 — Chat routes: isAuthenticated before userLimiter (regression guard)', () => {
  it('R10.1 — chat-message.route.ts: isAuthenticated appears before userLimiter', () => {
    const source = readFileSync(CHAT_MESSAGE_ROUTE, 'utf-8');

    const isAuthIdx = source.indexOf('isAuthenticated,');
    const userLimiterIdx = source.indexOf('userLimiter,');

    expect(isAuthIdx).toBeGreaterThanOrEqual(0);
    expect(userLimiterIdx).toBeGreaterThanOrEqual(0);

    // PASSES today — isAuthenticated is before userLimiter in chat-message route
    expect(isAuthIdx).toBeLessThan(userLimiterIdx);
  });

  it('R10.2 — chat-media.route.ts: isAuthenticated appears before userLimiter', () => {
    const source = readFileSync(CHAT_MEDIA_ROUTE, 'utf-8');

    const isAuthIdx = source.indexOf('isAuthenticated,');
    const userLimiterIdx = source.indexOf('userLimiter,');

    expect(isAuthIdx).toBeGreaterThanOrEqual(0);
    expect(userLimiterIdx).toBeGreaterThanOrEqual(0);

    // PASSES today
    expect(isAuthIdx).toBeLessThan(userLimiterIdx);
  });

  it('R10.3 — chat-compare.route.ts: isAuthenticated appears before userLimiter', () => {
    const source = readFileSync(CHAT_COMPARE_ROUTE, 'utf-8');

    const isAuthIdx = source.indexOf('isAuthenticated,');
    const userLimiterIdx = source.indexOf('userLimiter,');

    expect(isAuthIdx).toBeGreaterThanOrEqual(0);
    expect(userLimiterIdx).toBeGreaterThanOrEqual(0);

    // PASSES today
    expect(isAuthIdx).toBeLessThan(userLimiterIdx);
  });
});
