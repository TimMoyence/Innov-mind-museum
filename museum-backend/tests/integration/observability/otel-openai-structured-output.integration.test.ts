/**
 * RED phase — driver for the offline structured-output probe.
 *
 * Run `2026-07-14-otel-openai-instrumentation-kills-structured-llm`, task T1.5.
 * Cases: test-contract.md UC-1..UC-6 + UC-42 · design §6.2/§6.3 · spec AC-1..AC-4, AC-9.
 *
 * WHAT IS BEING PROVEN
 * --------------------
 * With `OTEL_ENABLED=true`, EVERY structured LLM section of the chat fails with
 * `TypeError: Body is unusable: Body has already been read` — 0 success / 42
 * errors observed on `dev`, i.e. the assistant answers with the canned
 * `createSummaryFallback` template and never actually answers. Root cause
 * (debug-log.md): `@opentelemetry/instrumentation-openai`, shipped ACTIVE BY
 * DEFAULT inside `@opentelemetry/auto-instrumentations-node` since 0.66.0,
 * `.then()`s the `APIPromise` returned by `chat.completions.create`, consuming
 * the HTTP body; LangChain's `withStructuredOutput` then routes through
 * `.parse()` → `_thenUnwrap` → a SECOND read of the same body → throw.
 *
 * WHY THE TIER IS `integration` AND NOT `unit`
 * --------------------------------------------
 * `InstrumentationBase` patches the Node module loader **from its constructor**.
 * A unit test that mocked `getNodeAutoInstrumentations` would therefore never
 * have seen this bug — it is not the *call* that breaks anything, it is the
 * construction*. The real boundary here is the module loader + the real `openai`
 * SDK + a real HTTP round-trip, and it is crossed inside the child process the
 * harness spawns (`tests/helpers/observability/otel-probe.harness.ts`). That is
 * also the `Tier-qui-l'aurait-pris` recorded in `docs/INCIDENT_LEDGER.md` for
 * `INC-2026-07-14-otel-openai-structured` (Gate D).
 *
 * Nothing on the failing boundary is mocked (spec C-8): not the OTel bundle, not
 * the `openai` SDK, not `@langchain/openai`, not the HTTP stack. Only the
 * content* of the provider's response is stubbed, by a loopback `node:http`
 * server. No API key, no outbound network — runs under plain `pnpm test`.
 *
 * FROZEN-TEST (UFR-022): the red→green flip must come from `src/` alone.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { runStructuredOutputProbe } from 'tests/helpers/observability/otel-probe.harness';

import type { ProbeRun } from 'tests/helpers/observability/otel-probe.harness';

// Each probe run boots a child Node process, compiles TS, builds the full OTel
// bundle and performs a real HTTP round-trip. Budget generously — a timeout here
// would masquerade as a product failure.
jest.setTimeout(300_000);

const BACKEND_ROOT = resolve(__dirname, '..', '..', '..');
const REPO_ROOT = resolve(BACKEND_ROOT, '..');
const RUN_ID = '2026-07-14-otel-openai-instrumentation-kills-structured-llm';
const INC_ID = 'INC-2026-07-14-otel-openai-structured';

const OPENAI_INSTRUMENTATION = '@opentelemetry/instrumentation-openai';
const UPSTREAM_ISSUE = 'https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3586';

/**
 * Instrumentations that MUST survive the fix — a blanket "disable the bundle"
 *  would pass a naive openai-absence check while destroying our observability.
 */
const LOAD_BEARING_INSTRUMENTATIONS = [
  '@opentelemetry/instrumentation-http',
  '@opentelemetry/instrumentation-express',
  '@opentelemetry/instrumentation-pg',
  '@opentelemetry/instrumentation-ioredis',
  '@opentelemetry/instrumentation-undici',
];

/**
 * Measured against the installed bundle (auto-instrumentations-node 0.75.0) on
 * 2026-07-14: 40 instrumentations in `InstrumentationMap`, 39 armed by default
 * (`fs` is the only default exclusion), 37 armed by today's policy (fs+dns+router
 * off), 36 once `instrumentation-openai` joins them. The delta of the fix is
 * EXACTLY ONE. This number is asserted, not hand-waved: a fix that "helpfully"
 * disables more must fail here.
 */
const EXPECTED_ROSTER_SIZE_AFTER_FIX = 36;

const FULL_PACKAGE_NAME = /^@opentelemetry\/instrumentation-[a-z0-9.-]+$/;

const BODY_UNUSABLE = /Body is unusable/;

const LIFT_THE_GUARD = [
  `UPSTREAM FIX DETECTOR — if THIS test just turned red, that is (probably) GOOD NEWS.`,
  `The 'control' probe arms the DEFAULT OTel bundle and is supposed to still reproduce`,
  `the upstream bug: TypeError "Body is unusable".`,
  `If it no longer does, a published @opentelemetry/instrumentation-openai has stopped`,
  `consuming the response body (the reference remedy is to patch _thenUnwrap — cf.`,
  `DataDog/dd-trace-js#5253). What to do:`,
  `  1. check the released version and read ${UPSTREAM_ISSUE}`,
  `  2. if it is genuinely fixed: drop '${OPENAI_INSTRUMENTATION}' from`,
  `     src/shared/observability/otel-instrumentation-policy.ts, refresh the roster`,
  `     allowlist, and delete this control mode.`,
  `The other possibility is worse: the harness stopped exercising the real path`,
  `(e.g. @langchain/openai got imported before tracing was armed). Verify before celebrating.`,
].join('\n');

const parsedShape = (parsed: unknown): { text: unknown; confidence: unknown } =>
  parsed as { text: unknown; confidence: unknown };

let guarded: ProbeRun;
let control: ProbeRun;
let guardedTracingOff: ProbeRun;
let guardedEnvForcedOn: ProbeRun;
let guardedEnvForcedOnFullName: ProbeRun;
let guardedEnvEmptyDenylist: ProbeRun;

beforeAll(() => {
  guarded = runStructuredOutputProbe({ mode: 'guarded' });
  control = runStructuredOutputProbe({ mode: 'control' });
  guardedTracingOff = runStructuredOutputProbe({
    mode: 'guarded',
    env: { OTEL_ENABLED: 'false' },
  });
  // The EFFECTIVE operator move (see the asymmetry note on UC-5): the env var
  // takes the SHORT suffix — `utils.js:getInstrumentationsFromEnv` prefixes
  // `@opentelemetry/instrumentation-` itself.
  guardedEnvForcedOn = runStructuredOutputProbe({
    mode: 'guarded',
    env: { OTEL_NODE_ENABLED_INSTRUMENTATIONS: 'openai' },
  });
  guardedEnvForcedOnFullName = runStructuredOutputProbe({
    mode: 'guarded',
    env: { OTEL_NODE_ENABLED_INSTRUMENTATIONS: OPENAI_INSTRUMENTATION },
  });
  guardedEnvEmptyDenylist = runStructuredOutputProbe({
    mode: 'guarded',
    env: { OTEL_NODE_DISABLED_INSTRUMENTATIONS: '' },
  });
});

describe('UC-1 — the structured section completes under the application real OTel boot', () => {
  it('exits 0 with a parsed answer and never surfaces "Body is unusable"', () => {
    // Guard against a harness failure (exit 2) being mistaken for the bug: a probe
    // that never printed a result line proves nothing at all.
    expect(guarded.result).toBeDefined();

    const result = guarded.result;
    if (result?.ok !== true) {
      // The DIAGNOSTIC comes first, deliberately. "expected true, received false"
      // would send the reader back to the archaeology this run exists to end. What
      // must be readable in the failure output is the bug itself.
      throw new Error(
        [
          `probe(guarded) failed — the structured section did not complete.`,
          `  ${result?.name ?? '?'}: ${result?.message ?? '(no result line)'}`,
          `  active instrumentations: ${String(result?.activeInstrumentations.length ?? 0)}`,
          `  openai instrumentation armed: ${String(
            result?.activeInstrumentations.includes(OPENAI_INSTRUMENTATION) ?? false,
          )}`,
          ``,
          `This is INC-2026-07-14-otel-openai-structured: @opentelemetry/instrumentation-openai`,
          `.then()s the APIPromise returned by chat.completions.create, consuming the HTTP body;`,
          `withStructuredOutput() then routes through .parse() → _thenUnwrap → a second read of`,
          `the same body. Fix: disable it in the auto-instrumentation policy (FULL package name).`,
        ].join('\n'),
      );
    }

    expect(guarded.code).toBe(0);
    expect(guarded.stdout).not.toMatch(BODY_UNUSABLE);
    expect(guarded.stderr).not.toMatch(BODY_UNUSABLE);
    expect(result.parsed).not.toBeNull();
  });
});

describe('UC-2 — usage_metadata and parsed survive the fix (cost / prompt-cache contract)', () => {
  it('exposes usage_metadata and a schema-conforming parsed object', () => {
    const result = guarded.result;
    expect(result?.ok).toBe(true);
    if (result?.ok !== true) return;

    // C-5: `includeRaw: true` is what feeds recordPromptCacheTelemetry and the
    // cost telemetry. A fix that lost it would be a silent observability outage.
    expect(result.hasUsageMetadata).toBe(true);
    expect(result.parsed).not.toBeNull();
    expect(typeof parsedShape(result.parsed).text).toBe('string');
    expect(typeof parsedShape(result.parsed).confidence).toBe('number');
  });
});

describe('UC-3 — the active roster is the previous roster minus exactly one entry', () => {
  it('drops instrumentation-openai and keeps every other instrumentation', () => {
    const roster = guarded.result?.activeInstrumentations ?? [];

    expect(roster).not.toContain(OPENAI_INSTRUMENTATION);
    for (const name of LOAD_BEARING_INSTRUMENTATIONS) {
      expect(roster).toContain(name);
    }
    // Delta of exactly one: 37 armed today, 36 after the fix.
    expect(roster).toHaveLength(EXPECTED_ROSTER_SIZE_AFTER_FIX);
    // Every entry is a FULL package name. A short key ('openai') is a silent
    // no-op in getNodeAutoInstrumentations — that is the trap this run closes.
    for (const name of roster) {
      expect(name).toMatch(FULL_PACKAGE_NAME);
    }
  });
});

describe('UC-4 — non-vacuity: the harness still SEES the upstream bug', () => {
  it('reproduces "Body is unusable" with the default bundle (and is the lift signal)', () => {
    const result = control.result;

    // Jest's expect() takes no message argument (that is Vitest). A gate whose
    // failure says only "expected 1, got 0" would send the next maintainer on the
    // exact archaeology this run exists to end — so the explanation is thrown.
    if (
      control.code !== 1 ||
      result?.ok !== false ||
      !result.message.includes('Body is unusable')
    ) {
      throw new Error(
        `${LIFT_THE_GUARD}\n\nactual: exit=${String(control.code)} result=${JSON.stringify(result)}`,
      );
    }

    expect(control.code).toBe(1);
    expect(result.name).toBe('TypeError');
    expect(result.message).toMatch(BODY_UNUSABLE);
    // The default bundle really does arm the offender — otherwise this control
    // proves nothing at all.
    expect(result.activeInstrumentations).toContain(OPENAI_INSTRUMENTATION);
  });
});

/**
 * THE NAMING ASYMMETRY — measured in the installed bundle on 2026-07-14, and the
 * reason this whole family of "disable it" attempts is a minefield:
 *
 *   - the PROGRAMMATIC map is keyed by the FULL package name
 *     (`{'@opentelemetry/instrumentation-openai': {enabled:false}}`); a short key
 *     is a silent no-op (`checkManuallyProvidedInstrumentationNames` only emits a
 *     `diag.error`, and we wire no DiagLogger).
 *   - the ENV VARS take the SHORT SUFFIX (`OTEL_NODE_ENABLED_INSTRUMENTATIONS=openai`);
 *     `getInstrumentationsFromEnv` (utils.js:167) prepends
 *     `@opentelemetry/instrumentation-` itself. Passing the FULL name there yields
 *     `@opentelemetry/instrumentation-@opentelemetry/instrumentation-openai`,
 *     which matches nothing — and because `isEnabledEnvSet` is now true, it
 *     disables the ENTIRE bundle.
 *
 * Both forms are exercised below. Asserting only the full-name form would be
 * VACUOUSLY green: the roster comes back empty, so "openai is absent" is true for
 * a reason that has nothing to do with our fix.
 */
describe('UC-5 — no environment variable can resurrect the broken path (R11 proven)', () => {
  it('keeps it disabled against OTEL_NODE_ENABLED_INSTRUMENTATIONS=openai (the effective form)', () => {
    // The plausible operator move: "let me get the gen_ai spans back". The
    // programmatic map is priority 1 in shouldDisableInstrumentation() —
    // evaluated BEFORE any env read (utils.js:110) — so this must change nothing.
    // TODAY this env var re-arms the offender and the section dies; the fix must
    // make the very same command harmless.
    expect(guardedEnvForcedOn.code).toBe(0);
    expect(guardedEnvForcedOn.result?.ok).toBe(true);
    expect(guardedEnvForcedOn.result?.activeInstrumentations).not.toContain(OPENAI_INSTRUMENTATION);
    expect(guardedEnvForcedOn.stdout).not.toMatch(BODY_UNUSABLE);
  });

  it('the full-package-name form of that env var arms nothing at all (asymmetry documented)', () => {
    // Green before AND after: this is the bundle's own behaviour, pinned so that
    // nobody later mistakes the empty roster for proof that the fix works.
    expect(guardedEnvForcedOnFullName.code).toBe(0);
    expect(guardedEnvForcedOnFullName.result?.ok).toBe(true);
    expect(guardedEnvForcedOnFullName.result?.activeInstrumentations).toEqual([]);
  });

  it('keeps the instrumentation disabled with an empty OTEL_NODE_DISABLED_INSTRUMENTATIONS', () => {
    expect(guardedEnvEmptyDenylist.code).toBe(0);
    expect(guardedEnvEmptyDenylist.result?.ok).toBe(true);
    expect(guardedEnvEmptyDenylist.result?.activeInstrumentations).not.toContain(
      OPENAI_INSTRUMENTATION,
    );
  });
});

describe('UC-6 — tracing off: the healthy path is independent of the tracing config', () => {
  it('completes with zero instrumentations armed when OTEL_ENABLED=false', () => {
    // The trigger axis control. Green BEFORE and AFTER the fix: it proves
    // OTEL_ENABLED is the single trigger, and that the fix breaks nothing in the
    // path that already worked (which is also the cold-start guarantee).
    expect(guardedTracingOff.code).toBe(0);
    expect(guardedTracingOff.result?.ok).toBe(true);
    expect(guardedTracingOff.result?.activeInstrumentations).toEqual([]);
  });
});

/**
 * FROZEN-TEST, extended to the support artefacts.
 *
 * `red-test-manifest.json` is UC-keyed, and Gate B rejects any key that is not a
 * `UC-<n>` — so the probe and the harnesses CANNOT be listed there, and
 * `post-edit-green-test-freeze.sh` therefore does not protect them. That leaves a
 * real hole: the green phase could turn UC-1 green by editing the PROBE (e.g.
 * quietly arming tracing after `@langchain/openai` is loaded, which makes
 * `instrumentation-openai` a no-op — verified: the probe then exits 0 with the bug
 * fully present) instead of fixing `src/`.
 *
 * This driver IS frozen, so it closes the hole from the inside: it pins the digest
 * of every support artefact of the red phase. Green must make these tests pass by
 * changing `src/` and nothing else. If an artefact is genuinely wrong, the protocol
 * is `BLOCK-TEST-WRONG` + a fresh red — not a quiet edit.
 */
const FROZEN_SUPPORT_ARTEFACTS: Record<string, string> = {
  'tests/fixtures/otel/structured-output-probe.ts':
    '2519c379620dad0ac103d31845e4adbbff0548a271bee9f9426604cd427e453e',
  'tests/helpers/observability/otel-probe.contract.ts':
    'eacf4cb4ae965b4bd202c0daaff58fc04fbb772fb3b85bf0411b7a22b3c95955',
  'tests/helpers/observability/otel-probe.harness.ts':
    '8240345e0ae05f83943c74e085bf0fae34511cf62292f56f511bdfc54e0a8b11',
  'tests/helpers/observability/otel-roster.harness.ts':
    'f6f677da973798a3fda646537c3b8231437f62567f699e851a0c60b0c89b75e2',
  'tests/helpers/observability/otel-roster.fixtures.ts':
    '7461c97bac18e53315c7b8e8ff8c0683101264cdf1962f4aeb7f8548282dfa7d',
  'tests/helpers/chat/llm-error.fixtures.ts':
    '30c5a54ae763baffd00b4490cc14050a92a6b3d260697457ac3a1a7a4010bd90',
  'tests/helpers/chat/section-task.fixtures.ts':
    '3be74ea39a68b9fad8c4773b6f3c4b24a426f468108e41921a66619d94bb1838',
};

describe('frozen-test — the red-phase support artefacts are byte-frozen too', () => {
  it.each(Object.entries(FROZEN_SUPPORT_ARTEFACTS))('%s is unmodified', (relative, expected) => {
    const actual = createHash('sha256')
      .update(readFileSync(resolve(BACKEND_ROOT, relative)))
      .digest('hex');
    if (actual !== expected) {
      throw new Error(
        [
          `${relative} was modified after the red phase.`,
          `  expected sha256 ${expected}`,
          `  actual   sha256 ${actual}`,
          ``,
          `The red→green flip must come from src/ alone (UFR-022). If this artefact is`,
          `genuinely wrong, emit BLOCK-TEST-WRONG and re-spawn a fresh red phase.`,
        ].join('\n'),
      );
    }
    expect(actual).toBe(expected);
  });
});

describe('UC-42 — the incident is recorded and Gate D passes', () => {
  const ledgerPath = resolve(REPO_ROOT, 'docs/INCIDENT_LEDGER.md');

  it('carries a ledger row with integration as Tier-qui-l-aurait-pris', () => {
    const ledger = readFileSync(ledgerPath, 'utf8');
    const row = ledger.split('\n').find((line) => line.startsWith(`| ${INC_ID} `));
    expect(row).toBeDefined();

    // 5 documented columns after the id: Symptôme | Échappé jusqu'à |
    // Tier-qui-l'aurait-pris | UC-régression | Fix commit.
    const columns = (row ?? '')
      .split('|')
      .slice(1, -1)
      .map((c) => c.trim());
    expect(columns).toHaveLength(6);
    expect(columns[3]).toMatch(/integration/);
    expect(columns[4]).toMatch(/UC-1\b/);
  });

  it('passes pre-complete-incident-regression-check.sh (Gate D)', () => {
    const hook = resolve(
      REPO_ROOT,
      '.claude/skills/team/team-hooks/pre-complete-incident-regression-check.sh',
    );
    let code = 0;
    let out = '';
    try {
      out = execFileSync('bash', [hook], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        env: { ...process.env, RUN_ID, INC_ID },
      });
    } catch (err) {
      const e = err as { status?: number; stdout?: string; stderr?: string };
      code = e.status ?? 1;
      out = `${e.stdout ?? ''}${e.stderr ?? ''}`;
    }
    if (code !== 0) {
      throw new Error(`Gate D failed (exit ${String(code)}):\n${out}`);
    }
    expect(code).toBe(0);
  });

  it('the behavioural reproduction of the incident is green (probe guarded)', () => {
    expect(guarded.code).toBe(0);
  });
});
