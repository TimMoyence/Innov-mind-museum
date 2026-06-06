#!/usr/bin/env node
/**
 * Sentinel: api-url-production-safety
 *
 * Run 2026-06-06-api-url-prod-safety (design §7, D6). Deterministic static gate
 * that fails any push where the build-time API-URL resolution could ship a
 * localhost URL for a production-class build — the defect that put
 * `http://localhost:3000` into a local Xcode Release/Archive binary and made
 * every API call fail on a physical device ("Aucun musée trouvé").
 *
 * It imports the REAL `museum-frontend/api-url.config.js` (a plain,
 * side-effect-free CommonJS module — cheaper and more honest than static regex
 * parse, mirrors the `fe-version-sync.mjs` override pattern) and asserts its
 * production contract. The self-test points it at fixtures via the
 * `API_URL_SAFETY_MODULE` env override (absolute path), exactly as
 * `fe-version-sync.mjs` accepts `FE_VERSION_SYNC_FRONTEND_ROOT`.
 *
 * Checks (all must pass; any failure → exit 1 with actionable stderr):
 *   1. PROD_API_BASE_URL is a non-empty https URL whose host is NOT loopback.
 *   2. resolveApiBaseUrl('production', {}) === PROD_API_BASE_URL (never localhost, no throw).
 *   3. resolveApiBaseUrl('production', { EXPO_PUBLIC_API_BASE_URL_PROD: localhost })
 *      THROWS (R4 fail-loud) — a MISCONFIGURED dedicated prod var is the genuine
 *      prod-misconfig. NB: the generic EXPO_PUBLIC_API_BASE_URL is the dev/LAN
 *      override and is deliberately IGNORED for a production build (corrected
 *      semantics, run 2026-06-06 green), so it is NOT the probe here.
 *   4. resolveVariant({ CONFIGURATION: 'Release' }) === 'production', AND with a
 *      stray APP_VARIANT=development it is STILL 'production' (Q2 precedence).
 *   5. DRY (real-module run only): the literal 'https://musaium.com' is NOT
 *      duplicated as an API-base default in app.config.ts / apiConfig.ts
 *      (App-Links `applinks:` / intent-filter `host:` usages are allowed).
 *
 * Invocation (from repo root, like the BE sentinels invoked by full path):
 *   node museum-frontend/scripts/sentinels/api-url-production-safety.mjs
 *
 * Exit 0 = safe / 1 = a production build could ship localhost (or DRY drift).
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

// museum-frontend/scripts/sentinels/ -> museum-frontend/
const frontendRoot = path.resolve(__dirname, '..', '..');
const repoRoot = path.resolve(frontendRoot, '..');

const DEFAULT_MODULE_PATH = path.join(frontendRoot, 'api-url.config.js');
const moduleOverride = process.env.API_URL_SAFETY_MODULE;
const targetModulePath = moduleOverride ? path.resolve(moduleOverride) : DEFAULT_MODULE_PATH;
// Whether we are checking the real repo module (enables the DRY filesystem scan)
// vs a unit-test fixture (which has no app.config.ts/apiConfig.ts siblings).
const isRealModule = !moduleOverride;

const failures = [];
const fail = (msg) => failures.push(msg);

const LOOPBACK_HOSTNAME = /^(localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|\[::1\]|::1)$/i;
const isLoopback = (value) => {
  if (typeof value !== 'string') {
    return false;
  }
  try {
    return LOOPBACK_HOSTNAME.test(new URL(value).hostname);
  } catch {
    return value.includes('localhost') || value.includes('127.0.0.1');
  }
};

let mod;
try {
  mod = require(targetModulePath);
} catch (error) {
  console.error(
    `[sentinel:api-url-production-safety] FAIL — cannot load module at ${targetModulePath}: ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
  process.exit(1);
}

const { PROD_API_BASE_URL, resolveApiBaseUrl, resolveVariant } = mod;

if (typeof resolveApiBaseUrl !== 'function' || typeof resolveVariant !== 'function') {
  console.error(
    '[sentinel:api-url-production-safety] FAIL — module must export resolveApiBaseUrl + resolveVariant functions.',
  );
  process.exit(1);
}

// ── Check 1 — prod constant present, https, non-loopback ───────────────────
if (typeof PROD_API_BASE_URL !== 'string' || PROD_API_BASE_URL.trim().length === 0) {
  fail('Check 1: PROD_API_BASE_URL is empty or not a string.');
} else if (!/^https:\/\//i.test(PROD_API_BASE_URL)) {
  fail(`Check 1: PROD_API_BASE_URL must be an https URL (got "${PROD_API_BASE_URL}").`);
} else if (isLoopback(PROD_API_BASE_URL)) {
  fail(`Check 1: PROD_API_BASE_URL must NOT be a loopback host (got "${PROD_API_BASE_URL}").`);
}

// ── Check 2 — production with no env resolves the prod constant, never localhost ──
try {
  const resolved = resolveApiBaseUrl('production', {});
  if (isLoopback(resolved)) {
    fail(
      `Check 2: resolveApiBaseUrl('production', {}) returned a localhost URL ("${resolved}") — ` +
        'a production build would ship localhost.',
    );
  } else if (resolved !== PROD_API_BASE_URL) {
    fail(
      `Check 2: resolveApiBaseUrl('production', {}) should default to PROD_API_BASE_URL ` +
        `("${PROD_API_BASE_URL}") but returned "${resolved}".`,
    );
  }
} catch (error) {
  fail(
    `Check 2: resolveApiBaseUrl('production', {}) threw unexpectedly: ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
}

// ── Check 3 — a MISCONFIGURED dedicated prod var (localhost) MUST throw ─────
// (R4 fail-loud). The generic EXPO_PUBLIC_API_BASE_URL is the dev/LAN override
// and is intentionally ignored for a production build (corrected semantics), so
// the probe targets the dedicated EXPO_PUBLIC_API_BASE_URL_PROD instead.
let threwOnForcedLocalhost = false;
try {
  resolveApiBaseUrl('production', {
    EXPO_PUBLIC_API_BASE_URL_PROD: 'http://localhost:3000',
  });
} catch {
  threwOnForcedLocalhost = true;
}
if (!threwOnForcedLocalhost) {
  fail(
    'Check 3: resolveApiBaseUrl for a production build whose EXPO_PUBLIC_API_BASE_URL_PROD ' +
      'points at localhost did NOT throw — the fail-loud guard (R4) is missing, so a ' +
      'misconfigured Release build could ship localhost.',
  );
}

// ── Check 4 — Release CONFIGURATION ⇒ production, beats a stray .env dev ────
try {
  if (resolveVariant({ CONFIGURATION: 'Release' }) !== 'production') {
    fail("Check 4: resolveVariant({ CONFIGURATION: 'Release' }) must be 'production' (R1).");
  }
  if (resolveVariant({ CONFIGURATION: 'Release', APP_VARIANT: 'development' }) !== 'production') {
    fail(
      'Check 4: a Release CONFIGURATION must beat a .env-sourced APP_VARIANT=development ' +
        "(Q2) but resolveVariant did not return 'production'.",
    );
  }
} catch (error) {
  fail(
    `Check 4: resolveVariant threw unexpectedly: ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
}

// ── Check 5 — DRY: no duplicated 'https://musaium.com' API-base literal ─────
// Only meaningful against the real repo module (fixtures have no siblings).
if (isRealModule) {
  const dryTargets = [
    path.join(frontendRoot, 'app.config.ts'),
    path.join(frontendRoot, 'shared', 'infrastructure', 'apiConfig.ts'),
  ];
  // Match the prod host quoted as a bare URL string (an API-base literal), NOT
  // App-Links contexts (`applinks:musaium.com`) nor intent-filter `host:`.
  const apiBaseLiteral = /(['"`])https:\/\/musaium\.com\1/;
  for (const file of dryTargets) {
    let contents;
    try {
      contents = fs.readFileSync(file, 'utf8');
    } catch {
      // File absent => nothing to drift; skip.
      continue;
    }
    const offending = contents
      .split('\n')
      .map((line, i) => ({ line, n: i + 1 }))
      .filter(({ line }) => apiBaseLiteral.test(line))
      // Allow the App-Links / intent-filter usages explicitly.
      .filter(({ line }) => !/applinks:/.test(line) && !/host:/.test(line));
    if (offending.length > 0) {
      const where = offending.map(({ n }) => `${path.relative(repoRoot, file)}:${n}`).join(', ');
      fail(
        `Check 5 (DRY/R7): the prod host literal 'https://musaium.com' is duplicated as an ` +
          `API-base default at ${where}. It must live ONLY in api-url.config.js (PROD_API_BASE_URL).`,
      );
    }
  }
}

if (failures.length > 0) {
  console.error(
    '[sentinel:api-url-production-safety] FAIL — production-localhost safety violated:',
  );
  for (const f of failures) {
    console.error(`  • ${f}`);
  }
  console.error(
    '\nFix: keep PROD_API_BASE_URL in museum-frontend/api-url.config.js, ensure a production ' +
      'build defaults to it (never localhost), and keep the R4 fail-loud throw intact.',
  );
  process.exit(1);
}

console.error(
  `[sentinel:api-url-production-safety] PASS — production build resolves a non-localhost host (${
    isRealModule ? PROD_API_BASE_URL : `fixture: ${targetModulePath}`
  }).`,
);
process.exit(0);
