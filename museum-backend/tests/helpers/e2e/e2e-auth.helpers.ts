import type { E2EHarness, E2EResponse } from './e2e-app-harness';

type RequestFn = (path: string, init?: RequestInit, token?: string) => Promise<E2EResponse>;

interface RegisterOverrides {
  email?: string;
  password?: string;
  firstname?: string;
  lastname?: string;
}

interface RegisterResult {
  userId: number;
  email: string;
}

interface LoginResult {
  accessToken: string;
  refreshToken: string;
  user: { id: number; email: string; role?: string };
}

interface RegisterAndLoginResult {
  token: string;
  userId: number;
  email: string;
  refreshToken: string;
  password: string;
}

/**
 * Marks a freshly-registered user as `email_verified = true` directly in the
 * database, bypassing the production verification-email flow that would
 * otherwise require an SMTP round-trip plus token consumption in tests.
 *
 * The login useCase rejects unverified users with `403 EMAIL_NOT_VERIFIED`,
 * so every e2e helper that needs a logged-in identity must pass through this
 * step right after `POST /api/auth/register`.
 */
export async function markEmailVerified(harness: E2EHarness, email: string): Promise<void> {
  await harness.dataSource.query(`UPDATE users SET email_verified = true WHERE email = $1`, [
    email,
  ]);
}

/**
 * Registers a new user via POST /api/auth/register and immediately marks the
 * resulting account as `email_verified = true` so subsequent `loginUser` calls
 * succeed (the login useCase rejects unverified accounts with 403).
 *
 * @param harness Live E2E harness — needed both for HTTP calls (`request`) and
 *   for the post-register DB update on the `users` table.
 * @param overrides Optional fixture overrides (email, password, firstname,
 *   lastname). Random unique email + `Password123!` are generated when omitted.
 * @returns The persisted userId and email of the new account.
 */
export async function registerUser(
  harness: E2EHarness,
  overrides: RegisterOverrides = {},
): Promise<RegisterResult> {
  const email =
    overrides.email ?? `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@musaium.test`;
  const password = overrides.password ?? 'Password123!';
  const firstname = overrides.firstname ?? 'Tester';
  const lastname = overrides.lastname ?? 'User';

  const res = await harness.request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, firstname, lastname }),
  });

  if (res.status !== 201) {
    throw new Error(`registerUser failed: status=${res.status} body=${JSON.stringify(res.body)}`);
  }

  const body = res.body as { user: { id: number; email: string } };
  await markEmailVerified(harness, body.user.email);
  return { userId: body.user.id, email: body.user.email };
}

/**
 * Logs in a user via POST /api/auth/login.
 * Returns accessToken, refreshToken, and user object.
 *
 * Accepts the same `RequestFn` shape as before so callers using
 * `harness.request` keep working without churn.
 * @param request
 * @param email
 * @param password
 */
export async function loginUser(
  request: RequestFn,
  email: string,
  password: string,
): Promise<LoginResult> {
  const res = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });

  if (res.status !== 200) {
    throw new Error(`loginUser failed: status=${res.status} body=${JSON.stringify(res.body)}`);
  }

  const body = res.body as LoginResult;
  return body;
}

/**
 * Registers a new user (auto-verifying email under the hood) and immediately
 * logs in. Returns token, userId, email, refreshToken, and password.
 * @param harness Live E2E harness — used for register + email verification + login.
 * @param overrides Optional fixture overrides forwarded to `registerUser`.
 */
export async function registerAndLogin(
  harness: E2EHarness,
  overrides: RegisterOverrides = {},
): Promise<RegisterAndLoginResult> {
  const password = overrides.password ?? 'Password123!';
  const { userId, email } = await registerUser(harness, { ...overrides, password });
  const login = await loginUser(harness.request, email, password);

  return {
    token: login.accessToken,
    userId,
    email,
    refreshToken: login.refreshToken,
    password,
  };
}
