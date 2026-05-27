#!/usr/bin/env node
// @ts-check
/**
 * Cycle B (« Aucun lead perdu », T7.3) — router↔spec drift sentinel (spec R14,
 * design §5).
 *
 * WHY: the existing `check-openapi-spec.cjs` only validates a hardcoded list of
 * required paths + the JSON shape — it does NOT enumerate the mounted routes.
 * That is exactly how the 3 `/api/leads/*` routes shipped while ABSENT from
 * `openapi.json` (verified drift: `Object.keys(paths).filter(/lead/)` → []).
 *
 * This sentinel enumerates the routes actually mounted by each router module and
 * fails if any {method, path} pair is undocumented in
 * `museum-backend/openapi/openapi.json`. The companion frozen test
 * (`tests/unit/openapi/router-spec-drift.test.ts`) walks the live Express
 * `leadsRouter.stack` at runtime; this standalone script — which CI + pre-push
 * run with zero TS-loader dependency — derives the same {method, path} set by
 * statically parsing the router source (`router.<method>('<path>', …)`). The
 * two agree by construction: same router, same mount prefix, same `:param` →
 * `{param}` normalisation.
 *
 * Extending coverage to another router = add an entry to ROUTERS below. The
 * ALLOW_LIST documents legitimately-undocumented routes (health/metrics/etc.)
 * so an exemption is a deliberate, reviewed change — never a silent skip.
 *
 * Run: pnpm sentinel:router-spec-drift  (exit 0 = pass, 1 = drift)
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = resolve(HERE, '../..');

/** Routers to enforce: each source file is mounted under `mountPrefix`. */
const ROUTERS = [
  {
    source: 'src/modules/leads/adapters/primary/http/routes/leads.route.ts',
    routerVar: 'leadsRouter',
    mountPrefix: '/api/leads',
  },
];

/**
 * Paths intentionally not in openapi.json (health/metrics/internal). Each entry
 * MUST carry a reason comment. Empty for now — leads routes ARE documented.
 * @type {Array<{ method: string, path: string, reason: string }>}
 */
const ALLOW_LIST = [];

/** Express `:param` -> OpenAPI `{param}`, collapse duplicate slashes. */
function toOpenApiPath(mountPrefix, routePath) {
  const joined = `${mountPrefix}${routePath}`.replace(/\/{2,}/g, '/');
  return joined.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}

/**
 * Statically extract `<routerVar>.<method>('<path>'` calls from a router source.
 * @returns {Array<{ method: string, path: string }>}
 */
function enumerateRoutesFromSource(source, routerVar, mountPrefix) {
  const text = readFileSync(resolve(BACKEND_ROOT, source), 'utf8');
  const re = new RegExp(
    `${routerVar}\\.(get|post|put|patch|delete|options|head)\\(\\s*['"\`]([^'"\`]+)['"\`]`,
    'g',
  );
  /** @type {Array<{ method: string, path: string }>} */
  const out = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    out.push({ method: m[1].toLowerCase(), path: toOpenApiPath(mountPrefix, m[2]) });
  }
  return out;
}

function loadSpecPaths() {
  const specPath = resolve(BACKEND_ROOT, 'openapi/openapi.json');
  const spec = JSON.parse(readFileSync(specPath, 'utf8'));
  return spec.paths ?? {};
}

function isAllowed(route) {
  return ALLOW_LIST.some((a) => a.method === route.method && a.path === route.path);
}

function main() {
  const specPaths = loadSpecPaths();
  /** @type {Array<{ method: string, path: string }>} */
  const mounted = [];
  for (const r of ROUTERS) {
    mounted.push(...enumerateRoutesFromSource(r.source, r.routerVar, r.mountPrefix));
  }

  if (mounted.length === 0) {
    console.error('[router-spec-drift] FAIL: no routes enumerated -- parser/config drift?');
    process.exit(1);
  }

  const undocumented = mounted.filter((route) => {
    if (isAllowed(route)) return false;
    const entry = specPaths[route.path];
    return !entry || !(route.method in entry);
  });

  if (undocumented.length > 0) {
    console.error('[router-spec-drift] FAIL: mounted routes missing from openapi.json:');
    for (const r of undocumented) {
      console.error(`  - ${r.method.toUpperCase()} ${r.path}`);
    }
    console.error('  Document them in museum-backend/openapi/openapi.json (or add to ALLOW_LIST).');
    process.exit(1);
  }

  console.log(
    `[router-spec-drift] OK: ${String(mounted.length)} mounted route(s) documented in openapi.json`,
  );
}

main();
