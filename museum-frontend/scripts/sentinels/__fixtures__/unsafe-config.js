/**
 * RED phase fixture — run 2026-06-06-api-url-prod-safety.
 *
 * An UNSAFE build-time config module: it reproduces the original defect — a
 * production build silently resolves to `http://localhost:3000` and NEVER
 * throws. The sentinel (`api-url-production-safety.mjs`), pointed here via
 * `API_URL_SAFETY_MODULE`, MUST exit 1 against this fixture.
 *
 * Defects on purpose:
 * - resolveApiBaseUrl('production', {}) returns localhost (not the prod const).
 * - it does NOT throw for a production build resolving to localhost (no R4).
 * - resolveVariant({ CONFIGURATION: 'Release' }) wrongly stays 'development'.
 */
'use strict';

const PROD_API_BASE_URL = 'https://musaium.com';
const LOCALHOST = 'http://localhost:3000';

function isLocalhostUrl(value) {
  if (typeof value !== 'string') {
    return false;
  }
  return value.includes('localhost') || value.includes('127.0.0.1');
}

// BUG: ignores CONFIGURATION entirely — a Release build stays development.
function resolveVariant(env) {
  const e = env || {};
  const raw = String(e.APP_VARIANT || e.EAS_BUILD_PROFILE || 'development').toLowerCase();
  if (raw === 'production') {
    return 'production';
  }
  if (raw === 'preview') {
    return 'preview';
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

// BUG: silent localhost fallback for production, no fail-loud.
function resolveApiBaseUrl(variant, env) {
  const e = env || {};
  const apiEnv = resolveApiEnvironment(variant, e);
  const explicit = (e.EXPO_PUBLIC_API_BASE_URL || '').trim() || undefined;
  const prod = (e.EXPO_PUBLIC_API_BASE_URL_PROD || '').trim() || undefined;
  if (apiEnv === 'production') {
    return prod || explicit || LOCALHOST; // <-- the defect: localhost default
  }
  return explicit || LOCALHOST;
}

module.exports = {
  PROD_API_BASE_URL,
  resolveVariant,
  resolveApiEnvironment,
  resolveApiBaseUrl,
  isLocalhostUrl,
};
