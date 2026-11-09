import { test, expect, request } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { randomBytes } from 'node:crypto';
import { Client } from 'pg';

test.use({ storageState: { cookies: [], origins: [] } });

interface SeededUser {
  email: string;
  password: string;
}

async function seedMuseumManager(): Promise<SeededUser> {
  const email = `e2e-mgr-${Date.now()}-${randomBytes(4).toString('hex')}@test.musaium.dev`;
  const password = `E2e!${randomBytes(32).toString('hex')}A`;

  const apiBase = process.env.API_BASE_URL ?? 'http://localhost:3000';
  const ctx = await request.newContext();
  try {
    const reg = await ctx.post(`${apiBase}/api/auth/register`, {
      data: {
        email,
        password,
        firstname: 'MuseumManagerTest',
        lastname: 'PlaywrightTest',
        gdprConsent: true,
        dateOfBirth: '1990-01-01',
      },
    });
    if (!reg.ok()) {
      throw new Error(`museum_manager registration failed (${reg.status()}): ${await reg.text()}`);
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
      "UPDATE users SET role = 'museum_manager', email_verified = true WHERE email = $1",
      [email],
    );
  } finally {
    await pg.end();
  }

  return { email, password };
}

test.describe('AdminShell — museum_manager access (T-B6 — R-C9 / D-C9)', () => {
  test('museum_manager navigates to /en/admin without 403 + AdminShell renders + axe AA clean', async ({
    page,
    context,
    baseURL,
  }) => {
    const { email, password } = await seedMuseumManager();
    const apiBase = process.env.API_BASE_URL ?? 'http://localhost:3000';

    const loginRes = await context.request.post(`${apiBase}/api/auth/login`, {
      data: { email, password },
    });
    expect(
      loginRes.ok(),
      `museum_manager login failed (${loginRes.status()}): ${await loginRes.text()}`,
    ).toBe(true);

    const url = new URL(baseURL ?? 'http://localhost:3001');
    await context.addCookies([
      {
        name: 'admin-authz',
        value: '1',
        domain: url.hostname,
        path: '/',
        sameSite: 'Lax',
        expires: Math.floor(Date.now() / 1000) + 60 * 60 * 1,
        httpOnly: false,
        secure: url.protocol === 'https:',
      },
    ]);

    if (url.protocol !== 'https:') {
      const cookies = await context.cookies();
      await context.clearCookies();
      await context.addCookies(cookies.map((cookie) => ({ ...cookie, secure: false })));
    }

    await page.goto('/en/admin');
    await page.waitForLoadState('networkidle');

    await expect(
      page.getByText('403', { exact: true }),
      'RoleGuard 403 fallback must NOT be rendered for museum_manager (R-C9)',
    ).toHaveCount(0);
    await expect(
      page.getByText(/access denied/i),
      'RoleGuard accessDenied fallback must NOT be rendered for museum_manager (R-C9)',
    ).toHaveCount(0);

    await expect(
      page.locator('a[href^="/en/admin/"]').first(),
      'AdminShell AuthenticatedLayout must render at least one admin nav link',
    ).toBeVisible({ timeout: 10_000 });

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  });
});
