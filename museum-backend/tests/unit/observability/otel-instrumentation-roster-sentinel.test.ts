/**
 * RED phase — the anti-recidivism gate: `scripts/sentinels/otel-instrumentation-roster.ts`.
 *
 * Run `2026-07-14-otel-openai-instrumentation-kills-structured-llm`
 * Cases: test-contract UC-13..UC-22 · design §D3 · spec AC-5.
 *
 * WHY THIS GATE EXISTS. `instrumentation-openai` was never asked for by anyone: it
 * entered the bundle in `auto-instrumentations-node@0.66.0`, ACTIVE BY DEFAULT, via
 * a transitive minor bump. A denylist ("is openai disabled?") would not have caught
 * it — nothing was there to deny. Only an ALLOWLIST of the COMPLETE effective
 * roster turns "a new instrumentation just appeared" into a failure BEFORE the merge.
 *
 * WHY IT READS `node_modules` AND NOT OUR SOURCE. `InstrumentationMap` lives in the
 * installed package. A sentinel that regexed `opentelemetry.ts` would be blind to
 * the only event that matters — a transitive bump. And a doc can lie where
 * `node_modules` cannot: `lib-docs/opentelemetry/LESSONS.md` D5 states that
 * `instrumentation-router` is NOT in the bundle and that our disable is a
 * "defensive no-op"; the installed 0.75.0 contains the key, so that disable is
 * load-bearing. That is the shortest argument for this gate.
 *
 * Tier `unit` (mechanically: no DataSource / container / outbound request) — but
 * the OBSERVABLE is a REAL PROCESS EXIT CODE, which `jest.mock` cannot fabricate.
 * The sentinel is spawned, never imported: it CONSTRUCTS instrumentations, and
 * `InstrumentationBase` patches the module loader from its constructor.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  cleanupExpectedRosterFiles,
  makeExpectedRosterFile,
} from 'tests/helpers/observability/otel-roster.fixtures';
import { runRosterSentinel } from 'tests/helpers/observability/otel-roster.harness';

jest.setTimeout(300_000);

const BACKEND_ROOT = resolve(__dirname, '..', '..', '..');
const REPO_ROOT = resolve(BACKEND_ROOT, '..');
const SENTINEL_SRC = resolve(BACKEND_ROOT, 'scripts/sentinels/otel-instrumentation-roster.ts');
const EXPECTED_JSON = resolve(
  BACKEND_ROOT,
  'scripts/sentinels/otel-instrumentation-roster.expected.json',
);
const PRE_PUSH = resolve(REPO_ROOT, '.husky/pre-push');
const SENTINEL_MIRROR = resolve(REPO_ROOT, '.github/workflows/sentinel-mirror.yml');
const PROBE_DRIVER = resolve(
  BACKEND_ROOT,
  'tests/integration/observability/otel-openai-structured-output.integration.test.ts',
);

const OPENAI_INSTRUMENTATION = '@opentelemetry/instrumentation-openai';
const EXPECTED_ROSTER_SIZE = 36;

/** The recorded allowlist. Missing = the feature does not exist yet (honest red). */
const readExpectedRoster = (): string[] => {
  if (!existsSync(EXPECTED_JSON)) {
    throw new Error(`missing allowlist: ${EXPECTED_JSON}`);
  }
  const parsed = JSON.parse(readFileSync(EXPECTED_JSON, 'utf8')) as { instrumentations?: string[] };
  if (!Array.isArray(parsed.instrumentations)) {
    throw new Error(`${EXPECTED_JSON} must expose { "instrumentations": string[] }`);
  }
  return parsed.instrumentations;
};

const readSentinelSource = (): string => {
  if (!existsSync(SENTINEL_SRC)) {
    throw new Error(`missing sentinel: ${SENTINEL_SRC}`);
  }
  return readFileSync(SENTINEL_SRC, 'utf8');
};

afterAll(() => {
  cleanupExpectedRosterFiles();
});

describe('UC-13 — the sentinel passes on the corrected tree', () => {
  it('exits 0 against the recorded allowlist', () => {
    const run = runRosterSentinel();
    if (run.code !== 0) {
      throw new Error(`sentinel:otel-roster failed (exit ${String(run.code)}):\n${run.output}`);
    }
    expect(run.code).toBe(0);
  });

  it('the recorded allowlist is the effective roster: 36 full names, offender absent', () => {
    const roster = readExpectedRoster();
    expect(roster).toHaveLength(EXPECTED_ROSTER_SIZE);
    expect(roster).not.toContain(OPENAI_INSTRUMENTATION);
    expect(roster).not.toContain('@opentelemetry/instrumentation-fs');
    expect(roster).not.toContain('@opentelemetry/instrumentation-dns');
    expect(roster).not.toContain('@opentelemetry/instrumentation-router');
    for (const name of roster) {
      expect(name).toMatch(/^@opentelemetry\/instrumentation-[a-z0-9.-]+$/);
    }
  });

  it('is reachable through the documented command (package.json script)', () => {
    // pre-push and the server mirror both call `pnpm sentinel:otel-roster`. A gate
    // that only exists as a file path is a gate nobody runs.
    const pkg = JSON.parse(readFileSync(resolve(BACKEND_ROOT, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts['sentinel:otel-roster']).toMatch(/otel-instrumentation-roster\.ts/);
  });
});

describe('UC-14 — BITE: an instrumentation APPEARS (the real entry vector)', () => {
  it('exits 1 and names the delta with a + prefix', () => {
    // Exact simulation of the 0.66.0 transitive bump that let `instrumentation-openai`
    // into the bundle, active, without a human asking for it.
    const roster = readExpectedRoster();
    const amputated = roster.filter((n) => n !== '@opentelemetry/instrumentation-pg');
    const run = runRosterSentinel({ expectedPath: makeExpectedRosterFile(amputated) });

    expect(run.code).toBe(1);
    expect(run.output).toContain('+ @opentelemetry/instrumentation-pg');
    // A gate that fails without saying WHAT moved costs the day it was meant to save.
    expect(run.output).toMatch(/allowlist|expected|audit/i);
  });
});

describe('UC-15 — BITE: an instrumentation DISAPPEARS', () => {
  it('exits 1 and names the delta with a - prefix', () => {
    // Two real causes: upstream drops it, OR its constructor throws — utils.js:148-154
    // swallows that into a `diag.error` and the instrumentation vanishes from the
    // roster IN SILENCE. A silent loss of observability must fail loudly.
    const roster = readExpectedRoster();
    const withGhost = [...roster, '@opentelemetry/instrumentation-ghost'];
    const run = runRosterSentinel({ expectedPath: makeExpectedRosterFile(withGhost) });

    expect(run.code).toBe(1);
    expect(run.output).toContain('- @opentelemetry/instrumentation-ghost');
  });
});

describe('UC-16 — BITE: a RENAME (one leaves, one arrives — what a denylist misses)', () => {
  it('exits 1 and names BOTH sides of the delta', () => {
    const roster = readExpectedRoster();
    const renamed = roster.map((n) =>
      n === '@opentelemetry/instrumentation-http' ? '@opentelemetry/instrumentation-http2' : n,
    );
    const run = runRosterSentinel({ expectedPath: makeExpectedRosterFile(renamed) });

    expect(run.code).toBe(1);
    // Word-bounded: `+ …-http` must not be satisfied by a `+ …-http2` line.
    expect(run.output).toMatch(/\+ @opentelemetry\/instrumentation-http(?![\w-])/);
    expect(run.output).toMatch(/- @opentelemetry\/instrumentation-http2(?![\w-])/);
  });
});

describe('UC-17 — BITE, invariant (iii): a policy key absent from the bundle = a no-op disable', () => {
  it.each([
    ['short name', 'openai'],
    ['typo', '@opentelemetry/instrumentation-opanai'],
    ['upstream rename', '@opentelemetry/instrumentation-openai-v2'],
  ])('%s (%s) exits 1 and says the disable is a silent no-op', (_label, key) => {
    // This invariant is what turns "everything is green and nothing is protected"
    // into "CI is red before the merge".
    const run = runRosterSentinel({ policyOverride: { [key]: { enabled: false } } });

    expect(run.code).toBe(1);
    expect(run.output).toContain(key);
    expect(run.output).toMatch(/no-op|not found in the installed bundle/i);
  });
});

describe('UC-18 — BITE, invariant (ii): a disabled key REAPPEARS in the roster', () => {
  it('exits 1 when the policy re-enables the offender', () => {
    // The "fix" a hurried contributor writes to get the gen_ai spans back. Invariant
    // (i) alone would go green again if they also refreshed the allowlist; (ii) makes
    // that manoeuvre impossible to perform quietly.
    const run = runRosterSentinel({
      policyOverride: { [OPENAI_INSTRUMENTATION]: { enabled: true } },
    });

    expect(run.code).toBe(1);
    expect(run.output).toContain(OPENAI_INSTRUMENTATION);
  });
});

describe('UC-19 — DETERMINISM: the shell cannot green or red the gate', () => {
  it.each([
    ['enabled list', { OTEL_NODE_ENABLED_INSTRUMENTATIONS: 'openai' }],
    ['disabled list', { OTEL_NODE_DISABLED_INSTRUMENTATIONS: 'http' }],
    [
      'both',
      { OTEL_NODE_ENABLED_INSTRUMENTATIONS: 'openai', OTEL_NODE_DISABLED_INSTRUMENTATIONS: 'http' },
    ],
  ])('verdict unchanged with a polluted env (%s)', (_label, env) => {
    // Left in place, `OTEL_NODE_ENABLED_INSTRUMENTATIONS=openai` would collapse the
    // roster to a single entry and report a massive phantom delta; the denylist
    // variant would report a phantom removal. A gate whose verdict depends on the
    // shell that ran it lies — once in each direction.
    const run = runRosterSentinel({ env });
    if (run.code !== 0) {
      throw new Error(`sentinel is env-sensitive (exit ${String(run.code)}):\n${run.output}`);
    }
    expect(run.code).toBe(0);
  });

  it('the sentinel explicitly deletes both OTEL_NODE_* variables before computing', () => {
    const source = readSentinelSource();
    expect(source).toContain('OTEL_NODE_ENABLED_INSTRUMENTATIONS');
    expect(source).toContain('OTEL_NODE_DISABLED_INSTRUMENTATIONS');
    expect(source).toMatch(/delete\s+process\.env/);
  });
});

describe('UC-20 — the sentinel reads THE policy, never a copy', () => {
  it('imports the policy module and hardcodes no instrumentation name in its logic', () => {
    const source = readSentinelSource();
    expect(source).toMatch(/otel-instrumentation-policy/);

    // A sentinel that re-copies the policy drifts on the first change and becomes a
    // green gate guarding nothing — the exact failure being repaired here.
    const codeLines = source.split('\n').filter((line) => !/^\s*(\*|\/\/|\/\*)/.test(line));

    expect(codeLines.filter((l) => l.includes('@opentelemetry/instrumentation-'))).toEqual([]);

    // And its logic must never reach for OUR source: a doc or a source file can
    // lie about what the bundle contains (LESSONS.md D5 does); node_modules cannot.
    expect(codeLines.filter((l) => l.includes('opentelemetry.ts'))).toEqual([]);
  });
});

describe('UC-21 — the sentinel lives in a disposable process (constructor trap, locked)', () => {
  it('is imported by no application file', () => {
    const hits = execFileSync(
      'bash',
      ['-lc', `grep -rl "otel-instrumentation-roster" src/ || true`],
      { cwd: BACKEND_ROOT, encoding: 'utf8' },
    ).trim();
    expect(hits).toBe('');
  });

  it('is never required inside a Jest worker (this driver spawns it)', () => {
    const driver = readFileSync(__filename, 'utf8');
    // No direct load of the sentinel, and no direct load of the bundle either:
    // building it here would patch the loader and contaminate every later test in
    // this worker (debug-log.md §2 — the bench error that invalidated 3 verdicts).
    expect(driver).not.toMatch(/require\(['"].*otel-instrumentation-roster['"]\)/);
    expect(driver).not.toMatch(/from ['"]@opentelemetry\/auto-instrumentations-node['"]/);
    expect(driver).not.toMatch(/require\(['"]@opentelemetry\/auto-instrumentations-node['"]\)/);
  });

  it('carries the warning in its own header', () => {
    const source = readSentinelSource();
    expect(source).toMatch(/constructor/i);
    expect(source).toMatch(/worker|disposable|process/i);
  });
});

describe('UC-22 — the gate is wired where it blocks: pre-push + server mirror', () => {
  it('.husky/pre-push runs Gate 35 fail-fast', () => {
    const hook = readFileSync(PRE_PUSH, 'utf8');
    expect(hook).toContain('sentinel:otel-roster');
    // `;` instead of `|| exit 1` = a gate that runs and never fails — the classic
    // failure mode (feedback_verify_real_gate_not_global_exit).
    expect(hook).toMatch(/sentinel:otel-roster[^\n]*\)\s*\|\|\s*exit 1/);
    expect(hook).toContain('Gate 35');
    expect(hook).toContain('All 35 gates');
  });

  it('.husky/pre-push stays syntactically valid', () => {
    // The whole hook is NOT executed here on purpose: pre-push runs the test suite,
    // and running it from inside the test suite is a fork bomb. Syntax + wiring are
    // asserted; execution belongs to the pre-push run itself (verify gate).
    execFileSync('bash', ['-n', PRE_PUSH], { cwd: REPO_ROOT });
    expect(true).toBe(true);
  });

  it('sentinel-mirror.yml replays the gate server-side (UFR-020 anti-bypass)', () => {
    const workflow = readFileSync(SENTINEL_MIRROR, 'utf8');
    expect(workflow).toContain('sentinel:otel-roster');
  });

  it('the integration driver of the probe is registered in the tier baseline', () => {
    // The driver crosses the real boundary IN THE CHILD, so the tier-signature
    // sentinel cannot see it in the file text. The exemption is DECLARED, with an
    // honest reason — not silently endured.
    const baseline = JSON.parse(
      readFileSync(resolve(REPO_ROOT, 'scripts/sentinels/.integration-tier-baseline.json'), 'utf8'),
    ) as { exempt: { path: string; reason: string }[] };
    const relative = PROBE_DRIVER.replace(`${REPO_ROOT}/`, '');
    const entry = baseline.exempt.find((e) => e.path === relative);
    expect(entry).toBeDefined();
    expect(entry?.reason ?? '').not.toMatch(/^(TODO|legacy|n\/a)$/i);
    expect((entry?.reason ?? '').length).toBeGreaterThan(30);
  });
});
