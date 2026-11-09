import type { E2EHarness, E2EResponse } from './e2e-app-harness';

type RequestFn = (path: string, init?: RequestInit, token?: string) => Promise<E2EResponse>;

interface RegisterOverrides {
  email?: string;
  password?: string;
  firstname?: string;
  lastname?: string;
  dateOfBirth?: string;
}

const DEFAULT_ADULT_DOB = '1990-06-13';

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

export async function markEmailVerified(harness: E2EHarness, email: string): Promise<void> {
  await harness.dataSource.query(`UPDATE users SET email_verified = true WHERE email = $1`, [
    email,
  ]);
}

export async function registerUser(
  harness: E2EHarness,
  overrides: RegisterOverrides = {},
): Promise<RegisterResult> {
  const email =
    overrides.email ?? `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@musaium.test`;
  const password = overrides.password ?? 'Password123!';
  const firstname = overrides.firstname ?? 'Tester';
  const lastname = overrides.lastname ?? 'User';
  const dateOfBirth = overrides.dateOfBirth ?? DEFAULT_ADULT_DOB;

  const res = await harness.request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, firstname, lastname, dateOfBirth }),
  });

  if (res.status !== 201) {
    throw new Error(`registerUser failed: status=${res.status} body=${JSON.stringify(res.body)}`);
  }

  const body = res.body as { user: { id: number; email: string } };
  await markEmailVerified(harness, body.user.email);
  return { userId: body.user.id, email: body.user.email };
}

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
