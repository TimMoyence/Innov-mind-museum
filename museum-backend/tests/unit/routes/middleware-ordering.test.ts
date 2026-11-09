import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROUTES_ROOT = path.resolve(__dirname, '../../../src/modules');

const AUTH_SESSION_ROUTE = path.join(
  ROUTES_ROOT,
  'auth/adapters/primary/http/routes/auth-session.route.ts',
);
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

function indexInBlock(block: string, pattern: string | RegExp): number {
  if (typeof pattern === 'string') {
    return block.indexOf(pattern);
  }
  const match = pattern.exec(block);
  return match ? match.index : -1;
}

function extractRouteBlock(source: string, routePath: string): string {
  const openPattern = new RegExp(
    `(?:router|authSessionRouter|mfaRouter)\\.post\\(\\s*['"]${routePath}['"]`,
  );
  const startMatch = openPattern.exec(source);
  if (!startMatch) return '';

  const start = startMatch.index;
  const afterStart = source.slice(start + 1);
  const nextRouteMatch = /(?:router|authSessionRouter|mfaRouter)\.[a-z]+\(/.exec(afterStart);
  const end = nextRouteMatch ? start + 1 + nextRouteMatch.index : source.length;

  return source.slice(start, end);
}

describe('R7 — auth-session.route.ts: validateBody BEFORE body-keyed limiters', () => {
  let source: string;

  beforeAll(() => {
    source = readFileSync(AUTH_SESSION_ROUTE, 'utf-8');
  });

  it("R7.1 — POST '/login': validateBody appears BEFORE loginByAccountLimiter", () => {
    const block = extractRouteBlock(source, '/login');
    expect(block).not.toBe('');

    const validateIdx = indexInBlock(block, 'validateBody(loginSchema)');
    const accountLimiterIdx = indexInBlock(block, 'loginByAccountLimiter');

    expect(validateIdx).toBeGreaterThanOrEqual(0);
    expect(accountLimiterIdx).toBeGreaterThanOrEqual(0);

    expect(validateIdx).toBeLessThan(accountLimiterIdx);
  });

  it("R7.1b — POST '/login': validateBody appears BEFORE the IP-keyed loginLimiter, so a rejected form never consumes the limit (decision 2026-11-07)", () => {
    const block = extractRouteBlock(source, '/login');
    expect(block).not.toBe('');

    const loginLimiterIdx = indexInBlock(block, 'loginLimiter,');
    const validateIdx = indexInBlock(block, 'validateBody(loginSchema)');

    expect(loginLimiterIdx).toBeGreaterThanOrEqual(0);
    expect(validateIdx).toBeGreaterThanOrEqual(0);
    expect(validateIdx).toBeLessThan(loginLimiterIdx);
  });

  it("R7.2 — POST '/refresh': validateBody appears BEFORE refreshLimiter", () => {
    const block = extractRouteBlock(source, '/refresh');
    expect(block).not.toBe('');

    const validateIdx = indexInBlock(block, 'validateBody(refreshSchema)');
    const refreshLimiterIdx = indexInBlock(block, 'refreshLimiter');

    expect(validateIdx).toBeGreaterThanOrEqual(0);
    expect(refreshLimiterIdx).toBeGreaterThanOrEqual(0);

    expect(validateIdx).toBeLessThan(refreshLimiterIdx);
  });

  it("R7.3 — POST '/social-login': validateBody appears BEFORE socialLoginLimiter", () => {
    const block = extractRouteBlock(source, '/social-login');
    expect(block).not.toBe('');

    const validateIdx = indexInBlock(block, 'validateBody(socialLoginSchema)');
    const socialLimiterIdx = indexInBlock(block, 'socialLoginLimiter');

    expect(validateIdx).toBeGreaterThanOrEqual(0);
    expect(socialLimiterIdx).toBeGreaterThanOrEqual(0);

    expect(validateIdx).toBeLessThan(socialLimiterIdx);
  });

  it("R7.3b — POST '/social-redeem': validateBody appears BEFORE socialLoginLimiter", () => {
    const block = extractRouteBlock(source, '/social-redeem');
    expect(block).not.toBe('');

    const validateIdx = indexInBlock(block, 'validateBody(socialRedeemSchema)');
    const socialLimiterIdx = indexInBlock(block, 'socialLoginLimiter');

    expect(validateIdx).toBeGreaterThanOrEqual(0);
    expect(socialLimiterIdx).toBeGreaterThanOrEqual(0);

    expect(validateIdx).toBeLessThan(socialLimiterIdx);
  });
});

describe('R10 — Chat routes: isAuthenticated before userLimiter (regression guard)', () => {
  it('R10.1 — chat-message.route.ts: isAuthenticated appears before userLimiter', () => {
    const source = readFileSync(CHAT_MESSAGE_ROUTE, 'utf-8');

    const isAuthIdx = source.indexOf('isAuthenticated,');
    const userLimiterIdx = source.indexOf('userLimiter,');

    expect(isAuthIdx).toBeGreaterThanOrEqual(0);
    expect(userLimiterIdx).toBeGreaterThanOrEqual(0);

    expect(isAuthIdx).toBeLessThan(userLimiterIdx);
  });

  it('R10.2 — chat-media.route.ts: isAuthenticated appears before userLimiter', () => {
    const source = readFileSync(CHAT_MEDIA_ROUTE, 'utf-8');

    const isAuthIdx = source.indexOf('isAuthenticated,');
    const userLimiterIdx = source.indexOf('userLimiter,');

    expect(isAuthIdx).toBeGreaterThanOrEqual(0);
    expect(userLimiterIdx).toBeGreaterThanOrEqual(0);

    expect(isAuthIdx).toBeLessThan(userLimiterIdx);
  });

  it('R10.3 — chat-compare.route.ts: isAuthenticated appears before userLimiter', () => {
    const source = readFileSync(CHAT_COMPARE_ROUTE, 'utf-8');

    const isAuthIdx = source.indexOf('isAuthenticated,');
    const userLimiterIdx = source.indexOf('userLimiter,');

    expect(isAuthIdx).toBeGreaterThanOrEqual(0);
    expect(userLimiterIdx).toBeGreaterThanOrEqual(0);

    expect(isAuthIdx).toBeLessThan(userLimiterIdx);
  });
});
