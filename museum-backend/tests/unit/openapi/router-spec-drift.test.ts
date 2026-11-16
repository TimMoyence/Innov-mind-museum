import { Router } from 'express';

import openApiSpec from '../../../openapi/openapi.json';

import type * as RouteTestSetup from 'tests/helpers/http/route-test-setup';

interface RouterLike {
  stack: {
    route?: { path?: unknown; methods?: Record<string, boolean> };
    handle?: unknown;
  }[];
}

const routerPrototype = (
  Router as unknown as { prototype: { use: (...args: unknown[]) => unknown } }
).prototype;
const mounts = new Map<unknown, string[]>();
const originalUse = routerPrototype.use;

const isRouter = (handler: unknown): handler is RouterLike =>
  typeof handler === 'function' && Array.isArray((handler as Partial<RouterLike>).stack);

const recordMounts = jest.spyOn(routerPrototype, 'use').mockImplementation(function (
  this: unknown,
  ...args: unknown[]
) {
  const prefix = typeof args[0] === 'string' ? args[0] : '/';
  for (const handler of args.flat()) {
    if (isRouter(handler)) mounts.set(handler, [...(mounts.get(handler) ?? []), prefix]);
  }
  return originalUse.apply(this, args);
});

let setup: typeof RouteTestSetup;
let app: unknown;

beforeAll(async () => {
  setup = await import('tests/helpers/http/route-test-setup');
  ({ app } = setup.createRouteTestApp());
  recordMounts.mockRestore();
});

const urlShape = (path: string): string =>
  path
    .split('/')
    .filter((segment) => segment !== '')
    .map((segment) => (segment.startsWith(':') || segment.startsWith('{') ? '{}' : segment))
    .join('/');

const joinPath = (prefix: string, path: string): string => `${prefix}/${path}`;

const mountedRoutes = (router: RouterLike, prefix: string): string[] =>
  router.stack.flatMap((layer) => {
    if (layer.route?.methods && typeof layer.route.path === 'string') {
      const path = joinPath(prefix, layer.route.path);
      return Object.entries(layer.route.methods)
        .filter(([method, enabled]) => enabled && method !== '_all')
        .map(([method]) => `${method} /${urlShape(path)}`);
    }
    return isRouter(layer.handle)
      ? (mounts.get(layer.handle) ?? []).flatMap((mount) =>
          mountedRoutes(layer.handle as RouterLike, joinPath(prefix, mount)),
        )
      : [];
  });

const documented = new Set(
  Object.entries(openApiSpec.paths as Record<string, Record<string, unknown>>).flatMap(
    ([path, operations]) => Object.keys(operations).map((method) => `${method} /${urlShape(path)}`),
  ),
);

afterAll(() => {
  setup.stopRateLimitSweep();
});

describe('CONTRAT-ROUTES', () => {
  it('CONTRAT-ROUTES · chaque route montée sous /api est documentée dans openapi.json, verbe et forme d’URL compris (le nom d’un paramètre de chemin ne change pas l’URL) : une route hors contrat ne peut être appelée que par une URL et un corps recopiés à la main', () => {
    const routes = mountedRoutes((app as { router: RouterLike }).router, '').filter((route) =>
      route.split(' ')[1].startsWith('/api/'),
    );
    expect(routes).toContain('post /api/leads/paywall-interest');
    expect(routes).toContain('get /api/museums/{}');
    expect(routes).toContain('post /api/auth/login');
    expect(routes).toContain('get /api/auth/google/initiate');
    expect(routes.filter((route) => !documented.has(route))).toEqual([]);
  });
});
