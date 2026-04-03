import type { E2EResponse } from './e2e-app-harness';

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
 * Registers a new user via POST /api/auth/register.
 * Returns the userId and email from the response.
 * @param request
 * @param overrides
 */
export async function registerUser(
  request: RequestFn,
  overrides: RegisterOverrides = {},
): Promise<RegisterResult> {
  const email =
    overrides.email ?? `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@musaium.test`;
  const password = overrides.password ?? 'Password123!';
  const firstname = overrides.firstname ?? 'Tester';
  const lastname = overrides.lastname ?? 'User';

  const res = await request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, firstname, lastname }),
  });

  if (res.status !== 201) {
    throw new Error(`registerUser failed: status=${res.status} body=${JSON.stringify(res.body)}`);
  }

  const body = res.body as { user: { id: number; email: string } };
  return { userId: body.user.id, email: body.user.email };
}

/**
 * Logs in a user via POST /api/auth/login.
 * Returns accessToken, refreshToken, and user object.
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
 * Registers a new user and immediately logs in.
 * Returns token, userId, email, refreshToken, and password.
 * @param request
 * @param overrides
 */
export async function registerAndLogin(
  request: RequestFn,
  overrides: RegisterOverrides = {},
): Promise<RegisterAndLoginResult> {
  const password = overrides.password ?? 'Password123!';
  const { userId, email } = await registerUser(request, { ...overrides, password });
  const login = await loginUser(request, email, password);

  return {
    token: login.accessToken,
    userId,
    email,
    refreshToken: login.refreshToken,
    password,
  };
}
