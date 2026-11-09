import { chromium, request, type FullConfig } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client } from 'pg';

const __dirname = import.meta.dirname;
const STORAGE_PATH = resolve(__dirname, 'playwright-storage', 'storageState.json');

async function seedAdminUser(email: string, password: string): Promise<void> {
  const ctx = await request.newContext();
  try {
    const reg = await ctx.post('http://localhost:3000/api/auth/register', {
      data: {
        email,
        password,
        firstname: 'PlaywrightTest',
        lastname: 'Admin',
        gdprConsent: true,
        dateOfBirth: '1990-01-01',
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
    await pg.query(
      "UPDATE users SET role = 'super_admin', email_verified = true WHERE email = $1",
      [email],
    );
  } finally {
    await pg.end();
  }
}

async function loginAndSaveStorage(
  email: string,
  password: string,
  baseURL: string,
): Promise<void> {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  try {
    const res = await context.request.post(`${baseURL}/api/auth/login`, {
      data: { email, password },
    });
    if (!res.ok()) {
      throw new Error(`API login failed (${res.status()}): ${await res.text()}`);
    }
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
    const state = await context.storageState();
    if (url.protocol !== 'https:') {
      state.cookies = state.cookies.map((cookie) => ({ ...cookie, secure: false }));
    }
    writeFileSync(STORAGE_PATH, JSON.stringify(state));
  } finally {
    await browser.close();
  }
}

export default async function globalSetup(config: FullConfig): Promise<void> {
  const email = `e2e-admin-${Date.now()}@test.musaium.dev`;
  const password = `E2e!${randomBytes(32).toString('hex')}A`;
  const baseURL = config.projects[0]?.use.baseURL ?? 'http://localhost:3001';

  await seedAdminUser(email, password);
  await loginAndSaveStorage(email, password, baseURL);

  process.env.ADMIN_E2E_EMAIL = email;
  process.env.ADMIN_E2E_PASSWORD = password;
}
