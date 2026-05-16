/**
 * Fresh unit coverage for `@shared/cache/redis-client` targeting the
 * Stryker NoCoverage mutants on the internal `parseClusterNodes` helper and
 * the construction branch of `createRedisClusterClient`.
 *
 * `env` is captured at module load time, so we cannot toggle
 * `REDIS_CLUSTER_NODES` at runtime and expect the singleton to reflect it.
 * Pattern (matches tests/unit/observability/langfuse-client.test.ts):
 *   - `jest.resetModules()` between tests,
 *   - `jest.doMock('@src/config/env', ...)` to inject a fake env,
 *   - `jest.doMock('ioredis', ...)` so the test never opens a real socket,
 *   - re-require the SUT inside each test to pick up the mocks.
 *
 * The single mutant the file disables explicitly (`if (!raw) return null`
 * with `// Stryker disable next-line` on L45) is intentionally NOT covered
 * here — Stryker treats it as Ignored, not NoCoverage.
 */

import type { ClusterNode, ClusterOptions } from 'ioredis';

export {}; // module scope for helper names

// Prevent dotenv.config() (called inside @src/config/env) from re-injecting
// host-env REDIS_* keys after the test overrides them. Mirrors the
// langfuse-client.test.ts setup.
jest.mock('dotenv', () => ({ config: jest.fn() }));

// ── Types & fakes ────────────────────────────────────────────────────────

interface RedisEnvShape {
  host: string;
  port: number;
  password: string | null;
  clusterNodes: string | null;
}

interface ClusterCtorCall {
  nodes: ClusterNode[];
  options: ClusterOptions | undefined;
}

/** Builds an env mock shaped like the slice the SUT reads. */
const makeEnvMock = (redis: Partial<RedisEnvShape> = {}): { env: { redis: RedisEnvShape } } => ({
  env: {
    redis: {
      host: 'localhost',
      port: 6379,
      password: null,
      clusterNodes: null,
      ...redis,
    },
  },
});

/** Captured `new Cluster(nodes, options)` calls per test. */
let clusterCalls: ClusterCtorCall[] = [];

/** Builds the ioredis mock — captures Cluster constructor invocations. */
const installIoredisMock = (): void => {
  jest.doMock('ioredis', () => {
    class FakeCluster {
      public readonly nodes: ClusterNode[];
      public readonly options: ClusterOptions | undefined;
      constructor(nodes: ClusterNode[], options?: ClusterOptions) {
        this.nodes = nodes;
        this.options = options;
        clusterCalls.push({ nodes, options });
      }
    }
    return {
      __esModule: true,
      Cluster: FakeCluster,
      // The SUT does not use `default`, but typing it satisfies `import Redis from 'ioredis'`
      // consumers that may be transitively pulled in.
      default: jest.fn(),
    };
  });
};

/** Loads the SUT with a programmable env. Returns the module's exports. */
const loadModule = (
  envOverride: Partial<RedisEnvShape> = {},
): typeof import('@shared/cache/redis-client') => {
  jest.doMock('@src/config/env', () => makeEnvMock(envOverride));
  installIoredisMock();
  return require('@shared/cache/redis-client') as typeof import('@shared/cache/redis-client');
};

// ─────────────────────────────────────────────────────────────────────────

describe('createRedisClusterClient', () => {
  beforeEach(() => {
    jest.resetModules();
    clusterCalls = [];
  });

  afterEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
  });

  // ── Null-return branches ─────────────────────────────────────────────

  it('returns null when REDIS_CLUSTER_NODES is unset (env.redis.clusterNodes === null)', () => {
    const mod = loadModule({ clusterNodes: null });
    expect(mod.createRedisClusterClient()).toBeNull();
    expect(clusterCalls).toHaveLength(0);
  });

  it('returns null when REDIS_CLUSTER_NODES contains only whitespace + commas (parsed → 0 nodes; kills L47 ConditionalExpression/EqualityOperator)', () => {
    // After split(',').map(trim).filter(Boolean), the resulting list is empty.
    // - `nodes.length === 0` → true mutant: would always return null regardless of input
    //   (killed by the multi-node test below).
    // - `nodes.length === 0` → false mutant: would skip the early-return and
    //   attempt `new Cluster([], …)` here (killed because we assert null + no ctor call).
    // - `nodes.length !== 0` mutant: same as the `false` mutant for this input.
    const mod = loadModule({ clusterNodes: '   ,  , ,   ' });

    expect(mod.createRedisClusterClient()).toBeNull();
    expect(clusterCalls).toHaveLength(0);
  });

  // ── parseClusterNodes — split / trim / filter / map ─────────────────

  it('parses a single "host:port" into one ClusterNode with the numeric port (kills L13 StringLiteral + L17 StringLiteral + L18 ObjectLiteral)', () => {
    const mod = loadModule({ clusterNodes: 'cache-a:7000', password: null });

    const client = mod.createRedisClusterClient();

    expect(client).not.toBeNull();
    expect(clusterCalls).toHaveLength(1);
    expect(clusterCalls[0].nodes).toEqual([{ host: 'cache-a', port: 7000 }]);
  });

  it('parses a comma-separated list of multiple nodes (kills L12 MethodExpression: removing split + L47 ConditionalExpression true mutant)', () => {
    // - The `split` mutant that returns `raw.split(',').map(s=>s.trim())` only
    //   (dropping `.filter(Boolean).map(...)`) would yield strings, not objects
    //   — the assertion `toEqual([{host, port}, ...])` flips it to Killed.
    // - The `nodes.length === 0 → true` mutant forces a null return; we assert
    //   non-null + exact node count, killing it.
    const mod = loadModule({ clusterNodes: 'cache-a:7000,cache-b:7001,cache-c:7002' });

    const client = mod.createRedisClusterClient();

    expect(client).not.toBeNull();
    expect(clusterCalls[0].nodes).toEqual([
      { host: 'cache-a', port: 7000 },
      { host: 'cache-b', port: 7001 },
      { host: 'cache-c', port: 7002 },
    ]);
  });

  it('trims whitespace around each entry (kills L14 ArrowFunction: () => undefined + L14 MethodExpression: removing .trim())', () => {
    // - `() => undefined` mutant: map(() => undefined).filter(Boolean) yields []
    //   → null return → fails the non-null assertion.
    // - Removing `.trim()` (`s.trim()` → `s`): the literal ' cache-a:7000' is
    //   truthy and survives filter(Boolean); the host becomes ' cache-a'
    //   (with leading space). Asserting host === 'cache-a' (no leading space)
    //   kills that mutant.
    const mod = loadModule({ clusterNodes: '  cache-a:7000 ,  cache-b:7001  ' });

    const client = mod.createRedisClusterClient();

    expect(client).not.toBeNull();
    expect(clusterCalls[0].nodes).toEqual([
      { host: 'cache-a', port: 7000 },
      { host: 'cache-b', port: 7001 },
    ]);
  });

  it('drops empty entries via filter(Boolean) (kills the filter-dropping mutant on L12 MethodExpression chain)', () => {
    // `cache-a:7000,,cache-b:7001` — the empty middle slot is removed.
    // Without `.filter(Boolean)`, the empty string would be mapped to
    // { host: '', port: 6379 } (Number('') → NaN → falls back to 6379),
    // which the toEqual assertion would catch.
    const mod = loadModule({ clusterNodes: 'cache-a:7000,,cache-b:7001' });

    const client = mod.createRedisClusterClient();

    expect(client).not.toBeNull();
    expect(clusterCalls[0].nodes).toEqual([
      { host: 'cache-a', port: 7000 },
      { host: 'cache-b', port: 7001 },
    ]);
    expect(clusterCalls[0].nodes).toHaveLength(2);
  });

  it('defaults port to 6379 when no port is specified (kills L18 LogicalOperator || → && + ConditionalExpression branches)', () => {
    // - `Number(undefined) || 6379` → 6379 (since NaN is falsy).
    // - LogicalOperator mutant `Number(portStr) && 6379` would yield NaN (falsy)
    //   → port: NaN; the strict toEqual on { port: 6379 } catches it.
    // - ConditionalExpression true/false mutants behave equivalently for the
    //   `|| 6379` short-circuit and are killed by the explicit 6379 assertion.
    const mod = loadModule({ clusterNodes: 'cache-a' });

    const client = mod.createRedisClusterClient();

    expect(client).not.toBeNull();
    expect(clusterCalls[0].nodes).toEqual([{ host: 'cache-a', port: 6379 }]);
  });

  it('defaults port to 6379 when port is non-numeric (Number("abc") → NaN, falsy → fallback)', () => {
    const mod = loadModule({ clusterNodes: 'cache-a:not-a-port' });

    const client = mod.createRedisClusterClient();

    expect(client).not.toBeNull();
    expect(clusterCalls[0].nodes).toEqual([{ host: 'cache-a', port: 6379 }]);
  });

  // ── Cluster construction options (L48/L49 ObjectLiteral + L49 LogicalOperator) ─

  it('passes redisOptions.password from env when set (kills L49 ObjectLiteral + LogicalOperator ?? → &&)', () => {
    // - ObjectLiteral mutant: would replace `{ password: ... }` with `{}`
    //   — the assertion on `redisOptions.password === 'sekret'` catches it.
    // - LogicalOperator `??` → `&&`: `env.redis.password && undefined` is
    //   undefined when password is truthy → password becomes undefined.
    //   With `??`, the truthy password is preserved as-is.
    const mod = loadModule({ clusterNodes: 'cache-a:7000', password: 'sekret' });

    const client = mod.createRedisClusterClient();

    expect(client).not.toBeNull();
    expect(clusterCalls[0].options).toBeDefined();
    expect(clusterCalls[0].options).toEqual({
      redisOptions: { password: 'sekret' },
    });
  });

  it('passes redisOptions.password: undefined when env.redis.password is null (?? null branch)', () => {
    const mod = loadModule({ clusterNodes: 'cache-a:7000', password: null });

    const client = mod.createRedisClusterClient();

    expect(client).not.toBeNull();
    expect(clusterCalls[0].options).toEqual({
      redisOptions: { password: undefined },
    });
  });

  it('merges caller-supplied ClusterOptions over the defaults (kills L48 ObjectLiteral)', () => {
    // - L48 ObjectLiteral mutant `{}` would drop the redisOptions key from the
    //   constructed options entirely. We assert redisOptions is present even
    //   when extra options are passed.
    const mod = loadModule({ clusterNodes: 'cache-a:7000', password: 'sekret' });

    const extra: ClusterOptions = { scaleReads: 'all' };
    const client = mod.createRedisClusterClient(extra);

    expect(client).not.toBeNull();
    expect(clusterCalls[0].options).toEqual({
      redisOptions: { password: 'sekret' },
      scaleReads: 'all',
    });
  });

  it('allows the caller to override redisOptions entirely (last-write-wins spread semantics)', () => {
    // Spread order in the SUT is `{ redisOptions: {...}, ...opts }` so any
    // `redisOptions` in `opts` wins — pinning this is a guard against the
    // L48 ObjectLiteral mutant flipping it.
    const mod = loadModule({ clusterNodes: 'cache-a:7000', password: 'sekret' });

    const override: ClusterOptions = {
      redisOptions: { password: 'overridden' },
    };
    const client = mod.createRedisClusterClient(override);

    expect(client).not.toBeNull();
    expect(clusterCalls[0].options?.redisOptions).toEqual({ password: 'overridden' });
  });
});
