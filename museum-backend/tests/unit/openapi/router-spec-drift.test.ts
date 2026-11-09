import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import leadsRouter from '@modules/leads/adapters/primary/http/routes/leads.route';

interface MountedRoute {
  method: string;
  path: string;
}

function toOpenApiPath(mountPrefix: string, routePath: string): string {
  const joined = `${mountPrefix}${routePath}`.replace(/\/{2,}/g, '/');
  return joined.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}

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
