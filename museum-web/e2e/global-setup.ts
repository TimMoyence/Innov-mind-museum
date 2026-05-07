import { chromium, request, type FullConfig } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client } from 'pg';

// `__dirname` is undefined under ESM (`"type": "module"` in package.json).
// `import.meta.dirname` is the Node-22 native equivalent.
const __dirname = import.meta.dirname;
const STORAGE_PATH = resolve(__dirname, 'playwright-storage', 'storageState.json');

async function seedAdminUser(email: string, password: string): Promise<void> {
  const ctx = await request.newContext();
  try {
    const reg = await ctx.post('http://localhost:3000/api/auth/register', {
      data: {
        email,
        password,
        // Letters-only — backend validator rejects digits in given/family
        // names with "firstname contains invalid characters" (zod schema in
        // museum-backend/src/modules/auth/adapters/primary/http/schemas).
        firstname: 'PlaywrightTest',
        lastname: 'Admin',
        gdprConsent: true,
      },
    });
    if (!reg.ok()) {
      throw new Error(`Admin registration failed (${reg.status()}): ${await reg.text()}`);
    }
  } finally {
    await ctx.dispose();
  }

  const pg = new Client({
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? '5433'),
    user: process.env.DB_USER ?? 'museum_dev',
    password: process.env.DB_PASSWORD ?? 'museum_dev_password',
    database: process.env.PGDATABASE ?? 'museum_dev',
  });
  await pg.connect();
  try {
    await pg.query("UPDATE users SET role = 'admin', email_verified = true WHERE email = $1", [
      email,
    ]);
  } finally {
    await pg.end();
  }
}

async function loginAndSaveStorage(
  email: string,
  password: string,
  baseURL: string,
): Promise<void> {
  // API-driven login. The prior UI-form flow was timing-fragile in CI: the
  // browser-side `setAdminAuthzCookie()` (src/lib/auth.tsx:31) had to land
  // before `context.storageState()` ran, otherwise the persisted state was
  // missing `admin-authz` and every spec hit the Edge middleware redirect
  // (src/middleware.ts:108-115) — 307 to /admin/login → no admin heading.
  const browser = await chromium.launch();
  const context = await browser.newContext();
  try {
    const res = await context.request.post(`${baseURL}/api/auth/login`, {
      data: { email, password },
    });
    if (!res.ok()) {
      throw new Error(`API login failed (${res.status()}): ${await res.text()}`);
    }
    // The backend's setAuthCookies() emits access_token + refresh_token + csrf_token
    // via Set-Cookie headers — context.request stores them in the shared cookie jar.
    // We additionally set `admin-authz` here because in production it is set
    // client-side by setAdminAuthzCookie() at src/lib/auth.tsx:31; keep this
    // shape (name/value/path/sameSite/expires) in sync with that helper.
    const url = new URL(baseURL);
    await context.addCookies([
      {
        name: 'admin-authz',
        value: '1',
        domain: url.hostname,
        path: '/',
        sameSite: 'Lax',
        expires: Math.floor(Date.now() / 1000) + 60 * 60 * 8,
        httpOnly: false,
        secure: url.protocol === 'https:',
      },
    ]);

    mkdirSync(resolve(__dirname, 'playwright-storage'), { recursive: true });
    await context.storageState({ path: STORAGE_PATH });
  } finally {
    await browser.close();
  }
}

export default async function globalSetup(config: FullConfig): Promise<void> {
  const email = `e2e-admin-${Date.now()}@test.musaium.dev`;
  // Random per-run password — defeats backend's HIBP breach check (the prior
  // hard-coded `AdminTest123!` is in the HaveIBeenPwned corpus and registered
  // with 400 PASSWORD_BREACHED). 32 random bytes → 64 hex chars, well above
  // the password policy floor and impossible to be in any breach list.
  const password = `E2e!${randomBytes(32).toString('hex')}A`;
  const baseURL = config.projects[0]?.use.baseURL ?? 'http://localhost:3001';

  await seedAdminUser(email, password);
  await loginAndSaveStorage(email, password, baseURL);

  process.env.ADMIN_E2E_EMAIL = email;
  process.env.ADMIN_E2E_PASSWORD = password;
}
