/**
 * Admin 401 no-loop regression (T3.8, audit-360 S3 tests-quality).
 *
 * REGRESSION RISK
 * ---------------
 * `src/middleware.ts` redirects any `/{locale}/admin/*` request (except
 * `/admin/login`) to the login page when the `admin-authz` cookie is absent.
 * `src/lib/api.ts` runs an axios-style refresh-and-retry interceptor: on a
 * first 401 from any `/api/...` call it fires `POST /api/auth/refresh`,
 * waits, then retries the original request. If the refresh ALSO returns
 * 401 the interceptor throws `Session expired` and `auth.tsx#logout` runs,
 * which clears `admin-authz` and `router.push`-es to `/admin/login`.
 *
 * The latent risk: if `clearAdminAuthzCookie()` ever regresses (typo on the
 * path, wrong Max-Age, SameSite drift) the cookie stays, the user lands on
 * `/admin/login`, the AuthProvider re-mounts, the cookie is still present,
 * the mount-time `/api/auth/me` probe fires, gets 401, logout fires again,
 * and we ping-pong between `/admin/users` and `/admin/login`. We have unit
 * coverage of the interceptor (`src/lib/api.test.ts`) and of the middleware
 * (`src/middleware.test.ts`), but nothing that exercises the full Edge +
 * client + interceptor + router triplet end-to-end. This spec pins it.
 *
 * WHY THE COOKIE IS SET BUT THE API IS 401
 * ---------------------------------------
 * `admin-authz` is a sentinel only — it is set client-side by the auth
 * provider on successful login and the backend never reads it. A user with
 * an expired refresh JWT but a still-warm sentinel cookie matches exactly
 * this scenario (cookie max-age = 8h, refresh JWT lifetime can be shorter
 * if revoked server-side). The storage state shipped by `global-setup.ts`
 * already includes the cookie, so we just need to neutralize the API.
 *
 * WHY URL IS CHECKED TWICE
 * ------------------------
 * If the interceptor were to loop, we would see `/admin/users` → `/admin/login`
 * → `/admin/users` (router push re-evaluates middleware) → … Reading the URL
 * once after `waitForURL` would catch only the first hop. Reading it again
 * after a small delay confirms the URL is *stable* — i.e. the loop is dead.
 */
import { test, expect } from '@playwright/test';

// Storage state from globalSetup already has admin-authz=1 + (now stale)
// auth cookies. We override only the API responses; the cookie jar stays.
test('admin 401 does not loop between /admin/users and /admin/login', async ({ page }) => {
  // Mock every /api/auth/* (me, refresh, logout) + /api/admin/* to return 401.
  // The refresh-and-retry path in src/lib/api.ts:165 only retries ONCE; if
  // /api/auth/refresh is also 401 the interceptor surrenders → onLogout fires.
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ status: 401, contentType: 'application/json', body: '{"message":"expired"}' }),
  );
  await page.route('**/api/auth/refresh', (route) =>
    route.fulfill({ status: 401, contentType: 'application/json', body: '{"message":"expired"}' }),
  );
  await page.route('**/api/admin/**', (route) =>
    route.fulfill({ status: 401, contentType: 'application/json', body: '{"message":"expired"}' }),
  );

  await page.goto('/en/admin/users');

  // Expected terminal state: clean redirect to /en/admin/login. Either the
  // middleware redirects after the cookie is cleared, OR the AuthGuard runs
  // router.replace once logout fires. Both paths converge on /admin/login.
  await page.waitForURL(/\/en\/admin\/login(\?|$)/, { timeout: 15_000 });
  const firstUrl = new URL(page.url()).pathname;

  // Heading from the login page proves we are NOT mid-redirect; the page
  // mounted and stopped. Matches the assertion in admin-login.spec.ts.
  await expect(page.getByRole('heading', { name: /musaium/i })).toBeVisible({ timeout: 10_000 });

  // Stability re-read: any loop would have bounced us back to /admin/users
  // within 1.5s (router.push + Edge middleware = ≤ a few hundred ms in dev).
  // If after a deliberate quiet window the pathname is unchanged, the loop
  // is provably dead.
  await page.waitForTimeout(1500);
  const secondUrl = new URL(page.url()).pathname;
  expect(secondUrl).toBe(firstUrl);
  expect(secondUrl).toMatch(/\/en\/admin\/login$/);
});
