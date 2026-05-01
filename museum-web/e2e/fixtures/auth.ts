/**
 * Phase 3 e2e — admin auth fixtures.
 *
 * `globalSetup` populates these env vars; specs read them via `getAdminCreds()`.
 */
export interface AdminCreds {
  email: string;
  password: string;
}

export function getAdminCreds(): AdminCreds {
  const email = process.env.ADMIN_E2E_EMAIL;
  const password = process.env.ADMIN_E2E_PASSWORD;
  if (!email || !password) {
    throw new Error('ADMIN_E2E_EMAIL/ADMIN_E2E_PASSWORD not set. Did globalSetup run?');
  }
  return { email, password };
}

export const STORAGE_STATE_PATH = 'e2e/playwright-storage/storageState.json';
