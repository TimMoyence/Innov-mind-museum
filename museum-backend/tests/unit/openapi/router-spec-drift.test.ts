/**
 * T7.1 (RED — Cycle B « Aucun lead perdu », Phase 7 — UFR-022 fresh-context red).
 *
 * Router↔spec drift sentinel (spec R14, design §5). The existing
 * `check-openapi-spec.cjs` only validates a hardcoded list of required paths +
 * the JSON shape — it does NOT enumerate the mounted Express stack, which is
 * precisely why the 3 `/api/leads/*` routes shipped while ABSENT from
 * `openapi.json` (verified drift: `Object.keys(paths).filter(/lead/)` → []).
 *
 * This test enumerates the REAL mounted Express routes (walking the
 * `leadsRouter` stack — `layer.route.path` + `layer.route.methods`, normalising
 * the `/api/leads` mount, Express `:param` → `{param}`) and asserts every
 * effective {method, path} pair is documented in `museum-backend/openapi/openapi.json`.
 *
 * RED reason: today none of `/api/leads/b2b`, `/api/leads/beta`,
 * `/api/leads/paywall-interest` exist in `openapi.json.paths`, so the
 * router↔spec comparison reports undocumented routes → the assertion fails
 * (exit ≠ 0). The green phase (T7.2) documents the 3 paths; this test then
 * passes byte-frozen, and T7.3 wires the equivalent logic into the standalone
 * `scripts/sentinels/router-spec-drift.mjs` for CI/pre-push.
 *
 * Maps: R14, R13.
 *
 * No factory needed (the test reads the live router + the committed spec).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import leadsRouter from '@modules/leads/adapters/primary/http/routes/leads.route';

/** A single mounted endpoint, normalised to OpenAPI conventions. */
interface MountedRoute {
  method: string;
  /** OpenAPI-style path, e.g. `/api/leads/b2b`. */
  path: string;
}

/** Express `:param` → OpenAPI `{param}`. */
function toOpenApiPath(mountPrefix: string, routePath: string): string {
  const joined = `${mountPrefix}${routePath}`.replace(/\/{2,}/g, '/');
  return joined.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}

/**
 * Walks a single Express Router stack and returns its {method, path} routes,
 * prefixed by the mount point. (Single-level: the leads router has no nested
 * sub-routers — verified via the layer stack shape.)
 */
function enumerateRoutes(
  router: { stack: Array<Record<string, unknown>> },
  mountPrefix: string,
): MountedRoute[] {
  const out: MountedRoute[] = [];
  for (const layer of router.stack) {
    const route = layer.route as { path?: string; methods?: Record<string, boolean> } | undefined;
    if (!route?.path || !route.methods) continue;
    for (const [method, enabled] of Object.entries(route.methods)) {
      if (!enabled || method === '_all') continue;
      out.push({ method: method.toLowerCase(), path: toOpenApiPath(mountPrefix, route.path) });
    }
  }
  return out;
}

function loadSpecPaths(): Record<string, Record<string, unknown>> {
  const specPath = join(__dirname, '..', '..', '..', 'openapi', 'openapi.json');
  const spec = JSON.parse(readFileSync(specPath, 'utf8')) as {
    paths: Record<string, Record<string, unknown>>;
  };
  return spec.paths;
}

describe('Router↔spec drift sentinel — leads routes documented in openapi.json (R14)', () => {
  const mounted = enumerateRoutes(
    leadsRouter as unknown as { stack: Array<Record<string, unknown>> },
    '/api/leads',
  );
  const specPaths = loadSpecPaths();

  it('enumerates the 3 mounted leads POST routes', () => {
    const paths = mounted.map((r) => `${r.method.toUpperCase()} ${r.path}`).sort();
    expect(paths).toEqual([
      'POST /api/leads/b2b',
      'POST /api/leads/beta',
      'POST /api/leads/paywall-interest',
    ]);
  });

  it('every mounted leads route is documented in openapi.json (no drift)', () => {
    const undocumented = mounted.filter((r) => {
      const pathEntry = specPaths[r.path];
      return !pathEntry || !(r.method in pathEntry);
    });
    expect(undocumented).toEqual([]);
  });
});
