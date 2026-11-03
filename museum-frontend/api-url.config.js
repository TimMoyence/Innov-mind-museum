'use strict';

const PROD_API_BASE_URL = 'https://musaium.com';
const LOCAL_API_BASE_URL = 'http://localhost:3000';

function resolveVariant(env) {
  const explicit = String(env.APP_VARIANT || env.EAS_BUILD_PROFILE || '').toLowerCase();
  if (explicit === 'production' || explicit === 'preview') {
    return explicit;
  }
  const configuration = typeof env.CONFIGURATION === 'string' ? env.CONFIGURATION.trim() : '';
  return configuration.length > 0 && !/debug/i.test(configuration) ? 'production' : 'development';
}

function resolveApiBaseUrl(variant, env) {
  if (variant !== 'development') {
    return PROD_API_BASE_URL;
  }
  const override =
    typeof env.EXPO_PUBLIC_API_BASE_URL === 'string' ? env.EXPO_PUBLIC_API_BASE_URL.trim() : '';
  const url = override && !override.startsWith('$') ? override : LOCAL_API_BASE_URL;
  return url.replace(/\/+$/, '');
}

Object.defineProperty(exports, '__esModule', { value: true });
exports.resolveVariant = resolveVariant;
exports.resolveApiBaseUrl = resolveApiBaseUrl;
