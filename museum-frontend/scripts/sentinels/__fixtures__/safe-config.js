/**
 * RED phase fixture — run 2026-06-06-api-url-prod-safety.
 *
 * A SAFE build-time config module: mirrors the production contract of
 * `museum-frontend/api-url.config.js`. The sentinel
 * (`api-url-production-safety.mjs`), pointed here via `API_URL_SAFETY_MODULE`,
 * MUST exit 0 against this fixture.
 *
 * - PROD_API_BASE_URL is a non-localhost https host.
 * - resolveApiBaseUrl('production', {}) returns the prod constant (never localhost).
 * - resolveApiBaseUrl('production', { localhost forced }) THROWS (R4 fail-loud).
 * - resolveVariant({ CONFIGURATION: 'Release' }) === 'production' (Q2), even with
 *   a stray APP_VARIANT=development.
 */
'use strict';

const PROD_API_BASE_URL = 'https://musaium.com';
const LOCALHOST = 'http://localhost:3000';

const LOOPBACK_HOSTNAME_PATTERN = /^(localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|\[::1\]|::1)$/i;

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

function resolveVariant(env) {
  const e = env || {};
  const explicit = String(e.APP_VARIANT || e.EAS_BUILD_PROFILE || '').toLowerCase();
  if (explicit === 'production') {
    return 'production';
  }
  if (explicit === 'preview') {
    return 'preview';
  }
  const config = typeof e.CONFIGURATION === 'string' ? e.CONFIGURATION.trim() : '';
  if (config.length > 0 && !/debug/i.test(config)) {
    return 'production';
  }
  return 'development';
}

function resolveApiEnvironment(variant, env) {
  const explicit = String((env && env.EXPO_PUBLIC_API_ENVIRONMENT) || '').toLowerCase();
  if (explicit === 'production') {
    return 'production';
  }
  if (explicit === 'staging') {
    return 'staging';
  }
  return variant === 'production' ? 'production' : 'staging';
}

function resolveApiBaseUrl(variant, env) {
  const e = env || {};
  const apiEnv = resolveApiEnvironment(variant, e);
  const explicit = (e.EXPO_PUBLIC_API_BASE_URL || '').trim() || undefined;
  const prod = (e.EXPO_PUBLIC_API_BASE_URL_PROD || '').trim() || undefined;
  const staging = (e.EXPO_PUBLIC_API_BASE_URL_STAGING || '').trim() || undefined;

  let resolved;
  if (apiEnv === 'production') {
    resolved = prod || explicit || PROD_API_BASE_URL;
  } else {
    resolved = explicit || staging || prod || LOCALHOST;
  }

  if (variant === 'production' && (!resolved || isLocalhostUrl(resolved))) {
    throw new Error(
      '[fixture:safe] production build resolved to a localhost/empty URL: ' + String(resolved),
    );
  }
  return resolved;
}

module.exports = {
  PROD_API_BASE_URL,
  resolveVariant,
  resolveApiEnvironment,
  resolveApiBaseUrl,
  isLocalhostUrl,
};
