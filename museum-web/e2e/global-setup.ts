import { chromium, request, type FullConfig } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client } from 'pg';

const STORAGE_PATH = resolve(__dirname, 'playwright-storage', 'storageState.json');

async function seedAdminUser(email: string, password: string): Promise<void> {
  const ctx = await request.newContext();
  try {
    const reg = await ctx.post('http://localhost:3000/api/auth/register', {
      data: {
        email,
        password,
        firstname: 'E2E',
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
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(`${baseURL}/en/admin/login`);
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole('button', { name: /log in|sign in|connecter/i }).click();
  await page.waitForURL(/\/en\/admin(\/|$)/, { timeout: 15_000 });

  mkdirSync(resolve(__dirname, 'playwright-storage'), { recursive: true });
  await context.storageState({ path: STORAGE_PATH });
  await browser.close();
}

export default async function globalSetup(config: FullConfig): Promise<void> {
  const email = `e2e-admin-${Date.now()}@test.musaium.dev`;
  const password = 'AdminTest123!';
  const baseURL = config.projects[0]?.use.baseURL ?? 'http://localhost:3001';

  await seedAdminUser(email, password);
  await loginAndSaveStorage(email, password, baseURL);

  process.env.ADMIN_E2E_EMAIL = email;
  process.env.ADMIN_E2E_PASSWORD = password;
}
