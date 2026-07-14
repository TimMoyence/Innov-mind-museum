/**
 * RED phase — a MACHINE signal for a degraded chat response (R8), and the client
 * contract that must NOT move while we add it (R7).
 *
 * Run `2026-07-14-otel-openai-instrumentation-kills-structured-llm`
 * Cases: test-contract UC-33, UC-36..UC-39, UC-45 · design §D4 · spec AC-7/AC-8/AC-4.
 *
 * WHY. For ~2 months, 100 % of chat sections failed and the product answered with
 * `createSummaryFallback` — a canned template — to every single user. What did the
 * system emit? A `logger.warn` and one Sentry span attribute
 * (`langchain-orchestrator-assembly.ts:152`). No counter, therefore no possible
 * alert, therefore the outage was found by accident. `chat_response_degraded_total`
 * is the smallest thing that makes "the chat is serving templates" alertable.
 *
 * The counter must be TRUSTWORTHY, which is a stronger requirement than "it
 * exists": UC-37 pins that a HEALTHY response increments NOTHING. A counter that
 * ticks on nominal traffic cannot be thresholded, so the alert never gets written,
 * so the next outage is again found by accident.
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

import {
  makeAssembleResponseInput,
  makeSectionRunFailure,
  makeSectionRunSuccess,
} from 'tests/helpers/chat/section-task.fixtures';

import type { SectionRunResult } from '@modules/chat/useCase/llm/llm-section-runner';
import type { LlmSectionName, MainAssistantOutput } from '@modules/chat/useCase/llm/llm-sections';

const BACKEND_ROOT = resolve(__dirname, '..', '..', '..');
const REPO_ROOT = resolve(BACKEND_ROOT, '..');
const METRIC = 'chat_response_degraded_total';

/**
 * Suites that prove Langfuse / prompt-cache / cost telemetry still flow. Editing
 *  one of them to make this run pass would be the definition of a faked green.
 */
const UNTOUCHABLE_TELEMETRY_SUITES = [
  'museum-backend/tests/unit/chat/orchestrator-cache-telemetry.spec.ts',
  'museum-backend/tests/unit/chat/langchain-orchestrator-cost-recording.test.ts',
  'museum-backend/tests/unit/observability/langchain-orchestrator-tracing.test.ts',
];

interface MetricSample {
  labels: Record<string, string>;
  value: number;
}
interface MetricJson {
  name: string;
  type: string;
  values: MetricSample[];
}
interface PromModule {
  registry: { getMetricsAsJSON: () => Promise<MetricJson[]> };
  chatResponseDegradedTotal?: { labelNames?: readonly string[] };
}
interface AssemblyModule {
  assembleResponse: (params: ReturnType<typeof makeAssembleResponseInput>) => {
    text: string;
    metadata: Record<string, unknown>;
  };
}

const bySection = (
  result?: SectionRunResult<MainAssistantOutput>,
): Map<LlmSectionName, SectionRunResult<MainAssistantOutput>> =>
  result === undefined
    ? new Map<LlmSectionName, SectionRunResult<MainAssistantOutput>>()
    : new Map<LlmSectionName, SectionRunResult<MainAssistantOutput>>([['summary', result]]);

const seriesOf = async (prom: PromModule): Promise<MetricSample[]> => {
  const all = await prom.registry.getMetricsAsJSON();
  return all.find((m) => m.name === METRIC)?.values ?? [];
};

describe('chat_response_degraded_total', () => {
  let prom: PromModule;
  let assembly: AssemblyModule;

  beforeEach(() => {
    jest.resetModules();
    jest.doMock('@shared/logger/logger', () => ({
      logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
    }));
    prom = require('@shared/observability/prometheus-metrics');
    assembly = require('@modules/chat/adapters/secondary/llm/langchain-orchestrator-assembly');
  });

  afterEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
  });

  it('UC-36 — a degraded response increments the counter EXACTLY once', async () => {
    assembly.assembleResponse(
      makeAssembleResponseInput({ bySection: bySection(makeSectionRunFailure()) }),
    );

    const series = await seriesOf(prom);
    const match = series.filter(
      (s) => s.labels.section === 'summary' && s.labels.reason === 'error',
    );
    expect(match).toHaveLength(1);
    // Exactly +1 — `resolveSummary` and `assembleResponse` must not BOTH increment.
    expect(match[0].value).toBe(1);
  });

  it('UC-37 — a HEALTHY response increments NOTHING (the counter that does not lie)', async () => {
    // Anchor first: without this, "the series did not move" is VACUOUSLY true as
    // long as the counter does not exist — a green test guarding nothing, which is
    // the exact failure class this whole run is about.
    expect(prom.chatResponseDegradedTotal).toBeDefined();

    const before = await seriesOf(prom);

    assembly.assembleResponse(
      makeAssembleResponseInput({ bySection: bySection(makeSectionRunSuccess()) }),
    );

    const after = await seriesOf(prom);
    expect(after).toEqual(before);
    // A counter that ticks on nominal traffic cannot be thresholded, so the alert
    // never gets written, so the next outage is again found by accident.
    expect(after.reduce((sum, s) => sum + s.value, 0)).toBe(0);
  });

  it('UC-38 — reason mapping: timeout | error | missing_result, and nothing else', async () => {
    assembly.assembleResponse(
      makeAssembleResponseInput({
        bySection: bySection(makeSectionRunFailure({ status: 'timeout' })),
      }),
    );
    assembly.assembleResponse(
      makeAssembleResponseInput({
        bySection: bySection(makeSectionRunFailure({ status: 'error' })),
      }),
    );
    // No section result at all — `summaryResult?.status ?? 'missing-result'`.
    assembly.assembleResponse(makeAssembleResponseInput({ bySection: bySection(undefined) }));

    const series = await seriesOf(prom);
    const reasons = series.map((s) => s.labels.reason).sort();

    // NOTE the deliberate spelling split (test-contract Q-b): the LOG keeps its
    // existing `missing-result` (hyphen) — a log consumer may depend on it — while
    // the METRIC LABEL is `missing_result` (underscore), per design §D4. Neither is
    // "corrected" into the other in passing.
    expect(reasons).toEqual(['error', 'missing_result', 'timeout']);
    expect(series).toHaveLength(3);
    for (const sample of series) {
      expect(sample.value).toBe(1);
      expect(sample.labels.section).toBe('summary');
    }
  });

  it('UC-39 — cardinality: no user-derived label, ever', async () => {
    // prom-client/LESSONS F1: an unbounded label (userId, requestId, req.path,
    // message text) = Prometheus storage explosion (the repo's own TD-PC-01).
    expect(prom.chatResponseDegradedTotal?.labelNames).toEqual(['section', 'reason']);

    // 50 degraded responses from 50 distinct users must still produce ONE series.
    for (let i = 0; i < 50; i += 1) {
      assembly.assembleResponse(
        makeAssembleResponseInput({
          bySection: bySection(makeSectionRunFailure()),
          input: { ...makeAssembleResponseInput().input, requestId: `req-${String(i)}` },
        }),
      );
    }

    const series = await seriesOf(prom);
    expect(series.length).toBeLessThanOrEqual(3);
    for (const sample of series) {
      expect(Object.keys(sample.labels).sort()).toEqual(['reason', 'section']);
    }
  });

  it('UC-33 — SECURITY: the client contract does not move (no stack, no causes)', () => {
    // `env.llm.includeDiagnostics` exposes ChatAssistantDiagnostics to the mobile
    // client. Without this guard, "preserve the cause" (R7) quietly becomes a
    // stack-trace exfiltration channel to every user.
    jest.resetModules();
    jest.doMock('@shared/logger/logger', () => ({
      logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
    }));
    const realEnv: { env: Record<string, unknown> } = require('@src/config/env');
    jest.doMock('@src/config/env', () => ({
      env: {
        ...realEnv.env,
        llm: { ...(realEnv.env.llm as Record<string, unknown>), includeDiagnostics: true },
      },
    }));
    const withDiagnostics: AssemblyModule = require('@modules/chat/adapters/secondary/llm/langchain-orchestrator-assembly');

    const output = withDiagnostics.assembleResponse(
      makeAssembleResponseInput({ bySection: bySection(makeSectionRunFailure()) }),
    );
    const diagnostics = output.metadata.diagnostics as {
      sections: Record<string, unknown>[];
    };
    const serialised = JSON.stringify(diagnostics);

    expect(serialised).not.toContain('stack');
    expect(serialised).not.toContain('causes');
    expect(serialised).not.toContain('errorName');
    expect(serialised).not.toContain('detail');
    expect(typeof diagnostics.sections[0].error).toBe('string');
    expect(Object.keys(diagnostics.sections[0]).sort()).toEqual([
      'attempts',
      'error',
      'latencyMs',
      'name',
      'payloadBytes',
      'status',
      'timeoutMs',
    ]);
  });
});

describe('UC-45 — no observability regression: Langfuse, prompt-cache and cost still flow', () => {
  it('the three telemetry suites are not touched by this run', () => {
    // The honest question to ask of a fix that REMOVES an instrumentation is: what
    // stopped being emitted? H4 says "nothing anyone consumes". A test beats a
    // hypothesis: these suites assert `recordPromptCacheTelemetry` + the Langfuse
    // observation + cost recording, they run in `pnpm test`, and modifying them
    // would be the signature of a regression dressed up as a pass.
    const diff = execFileSync(
      'git',
      ['diff', 'HEAD', '--name-only', '--', ...UNTOUCHABLE_TELEMETRY_SUITES],
      { cwd: REPO_ROOT, encoding: 'utf8' },
    ).trim();
    expect(diff).toBe('');
  });

  it('they still carry their telemetry assertions', () => {
    const cache = readFileSync(resolve(REPO_ROOT, UNTOUCHABLE_TELEMETRY_SUITES[0]), 'utf8');
    // The suite drives the REAL orchestrator and asserts the prompt-cache signal
    // derived from `usage_metadata` (`cache_read` → `cache_status` hit/partial/miss),
    // so it asserts the behaviour, not the helper's name.
    expect(cache).toContain('cache_read');
    expect(cache).toContain('cache_status');
    // `includeRaw: true` (C-5) is what surfaces usage_metadata — cost + prompt-cache
    // telemetry both hang off it. It is untouchable, and the probe asserts it end
    // to end (UC-2).
    const orchestrator = readFileSync(
      resolve(BACKEND_ROOT, 'src/modules/chat/adapters/secondary/llm/langchain.orchestrator.ts'),
      'utf8',
    );
    expect(orchestrator).toContain('includeRaw: true');
  });
});
