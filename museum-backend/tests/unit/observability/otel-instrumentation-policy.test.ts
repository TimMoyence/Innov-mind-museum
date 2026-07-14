/**
 * RED phase — the guard point itself: `src/shared/observability/otel-instrumentation-policy.ts`.
 *
 * Run `2026-07-14-otel-openai-instrumentation-kills-structured-llm`
 * Cases: test-contract UC-7, UC-8, UC-9, UC-41 · design §D1/§D2 · spec AC-3/AC-9/AC-11.
 *
 * These are `unit` in the mechanical ADR-012 sense (no DataSource, no
 * testcontainer, no outbound request) — the module under test is PURE DATA. That
 * purity is not cosmetic: it is asserted here (UC-9), because a single
 * `import { getNodeAutoInstrumentations } …` at the top of this module would load
 * AND CONSTRUCT ~40 instrumentations even when `OTEL_ENABLED=false` — patching the
 * module loader, destroying the cold-start guarantee, and letting the bug back in
 * through the side door.
 *
 * The module is loaded with `require()` (not `import`) on purpose: it does not
 * exist yet, and `import` would break `tsc --noEmit` for the whole tests/ tree
 * instead of producing an honest red at run time.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BACKEND_ROOT = resolve(__dirname, '..', '..', '..');
const REPO_ROOT = resolve(BACKEND_ROOT, '..');
const POLICY_SRC = resolve(BACKEND_ROOT, 'src/shared/observability/otel-instrumentation-policy.ts');
const OTEL_SRC = resolve(BACKEND_ROOT, 'src/shared/observability/opentelemetry.ts');
const CLAUDE_MD = resolve(REPO_ROOT, 'CLAUDE.md');

type InstrumentationPolicy = Record<string, { enabled: boolean }>;

const EXPECTED_KEYS = [
  '@opentelemetry/instrumentation-dns',
  '@opentelemetry/instrumentation-fs',
  '@opentelemetry/instrumentation-openai',
  '@opentelemetry/instrumentation-router',
];

const FULL_PACKAGE_NAME = /^@opentelemetry\/instrumentation-[a-z0-9.-]+$/;

/** Loaded lazily so a missing module fails the ASSERTION, not the whole suite file. */
const loadPolicy = (): InstrumentationPolicy => {
  const mod: {
    OTEL_AUTO_INSTRUMENTATION_POLICY?: InstrumentationPolicy;
  } = require('@shared/observability/otel-instrumentation-policy');
  if (mod.OTEL_AUTO_INSTRUMENTATION_POLICY === undefined) {
    throw new Error('otel-instrumentation-policy does not export OTEL_AUTO_INSTRUMENTATION_POLICY');
  }
  return mod.OTEL_AUTO_INSTRUMENTATION_POLICY;
};

const readPolicySource = (): string => readFileSync(POLICY_SRC, 'utf8');

describe('UC-7 — the policy: 4 keys, full names, frozen, enabled:false', () => {
  it('declares exactly the four disabled instrumentations', () => {
    const policy = loadPolicy();
    expect(Object.keys(policy).sort()).toEqual(EXPECTED_KEYS);
    for (const key of EXPECTED_KEYS) {
      expect(policy[key]).toEqual({ enabled: false });
    }
  });

  it('is frozen — a hot mutation cannot silently re-arm the offender', () => {
    const policy = loadPolicy();
    expect(Object.isFrozen(policy)).toBe(true);
    expect(Object.isFrozen(policy['@opentelemetry/instrumentation-openai'])).toBe(true);

    // A frozen object swallows the write in sloppy mode; what matters is that the
    // value does not change.
    try {
      policy['@opentelemetry/instrumentation-openai'].enabled = true;
    } catch {
      // strict mode throws — equally acceptable
    }
    expect(policy['@opentelemetry/instrumentation-openai'].enabled).toBe(false);
  });
});

describe('UC-8 — no policy key is a short name (the silent no-op, at the source)', () => {
  it('every key is a FULL package name', () => {
    const policy = loadPolicy();
    for (const key of Object.keys(policy)) {
      expect(key).toMatch(FULL_PACKAGE_NAME);
    }
  });

  it('rejects the short forms that the env vars use', () => {
    const policy = loadPolicy();
    // `getNodeAutoInstrumentations` indexes InstrumentationMap by PACKAGE NAME.
    // A short key ('openai') is accepted, logs a diag.error nobody listens to,
    // and leaves the instrumentation ACTIVE. Measured 2026-07-14: roster 39,
    // openai still present. The env vars take the OPPOSITE form (short suffix) —
    // which is exactly why this is so easy to get wrong.
    for (const shortName of ['openai', 'fs', 'dns', 'router']) {
      expect(Object.keys(policy)).not.toContain(shortName);
    }
  });
});

describe('UC-9 — the policy module has NO imports (cold-start + single source of truth)', () => {
  it('contains zero top-level import/require', () => {
    const source = readPolicySource();
    const offenders = source
      .split('\n')
      .filter((line) => /^\s*(import\s|const\s.*=\s*require\()/.test(line));
    expect(offenders).toEqual([]);
  });

  it('leaves opentelemetry.ts loading the OTel packages lazily inside initOpenTelemetry()', () => {
    const source = readFileSync(OTEL_SRC, 'utf8');
    const topLevelOtelImports = source
      .split('\n')
      .filter((line) => /^import .*@opentelemetry\//.test(line));
    expect(topLevelOtelImports).toEqual([]);
    // …and it must actually consume the shared policy, not a copied literal.
    expect(source).toMatch(/OTEL_AUTO_INSTRUMENTATION_POLICY/);
  });
});

describe('UC-41 — the guard carries its reason and its lift condition', () => {
  it('the policy source names the cause, the upstream issue and how to remove it', () => {
    const source = readPolicySource();
    // In six months someone will ask "is this still needed?". Without the reason
    // AT the guard point, they will delete it and replay two months of outage.
    expect(source).toContain('3586');
    expect(source).toContain('_thenUnwrap');
    expect(source).toMatch(/control/i);
  });

  it('CLAUDE.md § Pièges connus records the trap', () => {
    const claudeMd = readFileSync(CLAUDE_MD, 'utf8');
    expect(claudeMd).toContain('instrumentation-openai');
    expect(claudeMd).toContain('OTEL_ENABLED');
    expect(claudeMd).toContain('sentinel:otel-roster');
  });

  it('every path:line cited in the docs still resolves (roadmap-claim-resolves)', () => {
    const sentinel = resolve(REPO_ROOT, 'scripts/sentinels/roadmap-claim-resolves.mjs');
    let code = 0;
    let out = '';
    try {
      out = execFileSync('node', [sentinel], { cwd: REPO_ROOT, encoding: 'utf8' });
    } catch (err) {
      const e = err as { status?: number; stdout?: string; stderr?: string };
      code = e.status ?? 1;
      out = `${e.stdout ?? ''}${e.stderr ?? ''}`;
    }
    if (code !== 0) {
      throw new Error(`roadmap-claim-resolves failed (exit ${String(code)}):\n${out}`);
    }
    expect(code).toBe(0);
  });
});
