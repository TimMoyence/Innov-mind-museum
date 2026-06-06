/**
 * Build-time API-URL resolvers — co-located CommonJS module (run
 * 2026-06-06-api-url-prod-safety, design D1).
 *
 * WHY a plain `.js` (not a `.ts` helper): `app.config.ts` is loaded by Expo
 * CLI via Node `require`; it does NOT honor the `@/*` alias nor transitively
 * compile `.ts` imports (lib-docs/expo/LESSONS.md:34, PATTERNS.md:44). So the
 * build-time resolvers can NOT live in a TS module imported by app.config.ts.
 * This module is `require('./api-url.config.js')`-ed exactly like
 * `require('./package.json')` (app.config.ts), and is ALSO importable from the
 * runtime TS surface (`shared/infrastructure/apiConfig.ts`) so the prod-host
 * constant + loopback regex have a SINGLE source of truth (spec R7 / DRY).
 *
 * The resolvers are pure: they read nothing from a global — `env` is always
 * injected by the caller (`process.env` at build time, a synthetic object in
 * tests). Zero imports.
 *
 * Canonical prod API host = `https://musaium.com` (spec Q1, founder-confirmed).
 */
'use strict';

/** Single source of truth — the canonical production backend host (spec R7 / Q1). */
const PROD_API_BASE_URL = 'https://musaium.com';

/** Localhost/LAN default for development builds (the dev/Metro loop). */
const DEV_FALLBACK_BASE_URL = 'http://localhost:3000';

/**
 * Single source of truth for loopback host detection (spec R7). `apiConfig.ts`
 * delegates to `isLocalhostUrl` so the regex is never duplicated.
 */
const LOOPBACK_HOSTNAME_PATTERN = /^(localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|\[::1\]|::1)$/i;

/**
 * @param {unknown} value
 * @returns {string|undefined} the trimmed string, or `undefined` when empty / not a string.
 */
function nonEmpty(value) {
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

/**
 * Like {@link nonEmpty} but also rejects un-substituted shell placeholders
 * (`$EXPO_PUBLIC_…`) that EAS/CI may pass through verbatim.
 * @param {unknown} value
 * @returns {string|undefined}
 */
function nonPlaceholder(value) {
  const normalized = nonEmpty(value);
  if (!normalized) {
    return undefined;
  }
  return normalized.startsWith('$') ? undefined : normalized;
}

/**
 * @param {unknown} value - URL string to test.
 * @returns {boolean} `true` when the URL points at a loopback host.
 */
function isLocalhostUrl(value) {
  if (typeof value !== 'string') {
    return false;
  }
  try {
    return LOOPBACK_HOSTNAME_PATTERN.test(new URL(value).hostname);
  } catch {
    return value.includes('localhost') || value.includes('127.0.0.1');
  }
}

/**
 * Resolve the app variant (spec R1/R3/R5, design D2).
 *
 * Precedence (first match wins):
 *  1. Explicit `production` / `preview` from `APP_VARIANT` / `EAS_BUILD_PROFILE`
 *     — the EAS path; a recognized non-dev value wins outright (R5).
 *  2. Xcode Release signal — `CONFIGURATION` set and NOT containing `Debug`
 *     ⇒ `production`. This MUST beat a `.env`-sourced `APP_VARIANT=development`
 *     (the reported defect, Q2): we can't tell a `.env` var from a system var
 *     at this layer, so the rule is asymmetric by VALUE — explicit `development`
 *     does NOT override a Release build; explicit `production`/`preview` does.
 *  3. Explicit `development` — only reached when no Release signal fired, so the
 *     EAS `development` profile (no `CONFIGURATION`) still yields `development`.
 *  4. Xcode Debug signal — `CONFIGURATION` containing `Debug` ⇒ `development`.
 *  5. Default `development` — `npm run dev` / Metro / jsdom tests (no signal).
 *
 * @param {Record<string, string|undefined>} env
 * @returns {'development'|'preview'|'production'}
 */
function resolveVariant(env) {
  const e = env || {};
  const explicit = String(e.APP_VARIANT || e.EAS_BUILD_PROFILE || '').toLowerCase();

  // 1. Explicit non-development value wins (EAS path, R5).
  if (explicit === 'production') {
    return 'production';
  }
  if (explicit === 'preview') {
    return 'preview';
  }

  // 2. Xcode Release signal beats a .env-sourced `development` (Q2 / R1).
  const config = typeof e.CONFIGURATION === 'string' ? e.CONFIGURATION.trim() : '';
  if (config.length > 0 && !/debug/i.test(config)) {
    return 'production';
  }

  // 3. Explicit development (EAS development profile, no Release signal).
  // 4. Debug CONFIGURATION.
  // 5. No signal at all.
  return 'development';
}

/**
 * Resolve the target API environment (unchanged semantics vs the former inlined
 * `app.config.ts` helper — spec R5).
 * @param {'development'|'preview'|'production'} variant
 * @param {Record<string, string|undefined>} env
 * @returns {'staging'|'production'}
 */
function resolveApiEnvironment(variant, env) {
  const explicit = nonPlaceholder(env && env.EXPO_PUBLIC_API_ENVIRONMENT);
  const normalized = explicit ? explicit.toLowerCase() : undefined;
  if (normalized === 'production') {
    return 'production';
  }
  if (normalized === 'staging') {
    return 'staging';
  }
  return variant === 'production' ? 'production' : 'staging';
}

/**
 * @param {unknown} value
 * @returns {boolean} `true` when the env var was supplied at all (even as
 *   whitespace) — distinguishes "operator set an invalid URL" (fail-loud, R4)
 *   from "operator supplied nothing" (safe prod-constant default, R2).
 */
function isProvided(value) {
  return typeof value === 'string';
}

/**
 * Resolve the API base URL (spec R2/R3/R4, design D-Q4).
 *
 * Corrected production semantics (run 2026-06-06-api-url-prod-safety, green):
 * the GENERIC `EXPO_PUBLIC_API_BASE_URL` is a dev/LAN override (the founder's
 * single `.env` pins it to `http://localhost:3000` for `dev:stack`). A
 * production build must therefore IGNORE it entirely and honor ONLY the
 * dedicated `EXPO_PUBLIC_API_BASE_URL_PROD`:
 *
 * - `production` apiEnv with NO `_PROD` supplied ⇒ {@link PROD_API_BASE_URL}
 *   (NOT localhost, R2) WITHOUT throwing — even when a generic localhost
 *   `EXPO_PUBLIC_API_BASE_URL` is present (it is the dev var, not a prod
 *   misconfig).
 * - `production` apiEnv with `_PROD` supplied but empty OR localhost ⇒ THROW
 *   (R4 fail-loud): that is a genuine prod misconfiguration — a Release/Archive
 *   binary must never silently ship localhost, and an empty `_PROD` must not be
 *   silently masked by the prod constant.
 * - `production` apiEnv with a valid `_PROD` ⇒ that value, even when a generic
 *   localhost `EXPO_PUBLIC_API_BASE_URL` is also present (dedicated beats
 *   generic).
 * - non-production apiEnv keeps the localhost/LAN dev default (R3); the generic
 *   `EXPO_PUBLIC_API_BASE_URL` is honored there (the dev/LAN loop).
 * - `preview` is intentionally NOT fail-loud (a preview LAN dev-client may
 *   legitimately point at localhost; the runtime guard still rejects it at
 *   startup).
 *
 * @param {'development'|'preview'|'production'} variant
 * @param {Record<string, string|undefined>} env
 * @returns {string}
 */
function resolveApiBaseUrl(variant, env) {
  const e = env || {};
  const explicit = nonPlaceholder(e.EXPO_PUBLIC_API_BASE_URL);
  const staging = nonPlaceholder(e.EXPO_PUBLIC_API_BASE_URL_STAGING);
  const production = nonPlaceholder(e.EXPO_PUBLIC_API_BASE_URL_PROD);
  const apiEnvironment = resolveApiEnvironment(variant, e);

  if (apiEnvironment === 'production') {
    if (variant === 'production') {
      // Honor ONLY the dedicated prod var — the generic EXPO_PUBLIC_API_BASE_URL
      // is the dev/LAN override and is deliberately ignored for a prod build.
      const suppliedProd = isProvided(e.EXPO_PUBLIC_API_BASE_URL_PROD);

      // R4 fail-loud: an operator who SUPPLIED `_PROD` but left it empty or
      // pointed it at localhost is misconfigured — throw rather than mask it.
      if (suppliedProd && (!production || isLocalhostUrl(production))) {
        throw new Error(
          '[app.config] Production build resolved API base URL to a localhost/empty value (' +
            String(production) +
            '). A Release/Archive build must target the prod backend. ' +
            'Set EXPO_PUBLIC_API_BASE_URL_PROD to the prod host or remove the localhost override.',
        );
      }

      // `_PROD` absent (or a valid `_PROD`) ⇒ the dedicated value or the prod
      // constant. The generic localhost EXPO_PUBLIC_API_BASE_URL is ignored.
      return production || PROD_API_BASE_URL;
    }

    // `preview` reaching the production apiEnv via an explicit
    // EXPO_PUBLIC_API_ENVIRONMENT: not fail-loud (see jsdoc).
    return production || explicit || PROD_API_BASE_URL;
  }

  return explicit || staging || production || DEV_FALLBACK_BASE_URL;
}

module.exports = {
  PROD_API_BASE_URL,
  DEV_FALLBACK_BASE_URL,
  LOOPBACK_HOSTNAME_PATTERN,
  isLocalhostUrl,
  resolveVariant,
  resolveApiEnvironment,
  resolveApiBaseUrl,
};
