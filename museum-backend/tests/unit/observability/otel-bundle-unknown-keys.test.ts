/**
 * RED phase — the bundle SILENTLY ignores unknown configuration keys.
 *
 * Run `2026-07-14-otel-openai-instrumentation-kills-structured-llm`
 * Cases: test-contract UC-11 (short name) + UC-12 (typo, upstream rename) · spec AC-5.
 *
 * This is the "everything is green and nothing is protected" class. Writing
 * `{'openai': {enabled: false}}` FEELS like disabling the instrumentation. It is
 * not: `getNodeAutoInstrumentations` indexes `InstrumentationMap` by FULL package
 * name, and an unknown key only triggers `diag.error(...)` inside
 * `checkManuallyProvidedInstrumentationNames` (utils.js:159) — which is MUTE,
 * because we wire no `DiagLogger`. The instrumentation stays armed and the chat
 * stays broken, with a config that reads as if it were fixed.
 *
 * These UCs are GUARDS (green before and after): they pin a property of the
 * bundle, and they are the reason invariant (iii) of the roster sentinel exists.
 * They bite the day upstream makes unknown keys fatal — at which point (iii)
 * becomes redundant, and this test says so.
 *
 * Tier `unit` (ADR-012, mechanically: no DataSource, no container, no outbound
 * request) — but the OBSERVABLE is the EXIT CODE of a real child process running
 * the real bundle. `jest.mock` cannot fabricate that. The bundle is NEVER built
 * inside the Jest worker: `InstrumentationBase` patches the module loader from its
 * constructor and would contaminate every subsequent test in this worker
 * (debug-log.md §2).
 */
import { runInDisposableNode } from 'tests/helpers/observability/otel-roster.harness';

jest.setTimeout(120_000);

const OPENAI_INSTRUMENTATION = '@opentelemetry/instrumentation-openai';

/**
 * Builds the bundle with ONE user-provided key, prints the resulting roster.
 * @param key
 */
const rosterWithKey = (key: string): { code: number; names: string[]; output: string } => {
  const script = `
    const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
    const names = getNodeAutoInstrumentations({ ${JSON.stringify(key)}: { enabled: false } })
      .map((i) => i.instrumentationName);
    process.stdout.write(JSON.stringify(names));
  `;
  const run = runInDisposableNode(script);
  const names = run.code === 0 ? (JSON.parse(run.stdout) as string[]) : [];
  return { code: run.code, names, output: run.output };
};

const BITE_CONDITION =
  'If this test goes red because the child THREW, upstream made unknown instrumentation keys fatal. ' +
  'That is good news: invariant (iii) of scripts/sentinels/otel-instrumentation-roster.ts becomes redundant.';

describe('UC-11 — a SHORT key is a silent no-op', () => {
  it("{'openai': {enabled:false}} does not throw and does NOT disable anything", () => {
    const { code, names, output } = rosterWithKey('openai');

    // No throw: the bundle accepted a key that means nothing to it.
    if (code !== 0) {
      throw new Error(`${BITE_CONDITION}\n\nchild exit=${String(code)}\n${output}`);
    }
    expect(code).toBe(0);
    // And the instrumentation we "disabled" is still armed. This is the whole point.
    expect(names).toContain(OPENAI_INSTRUMENTATION);
  });
});

describe('UC-12 — a TYPO and an upstream RENAME are the same silent no-op', () => {
  it.each([
    ['typo', '@opentelemetry/instrumentation-opanai'],
    ['upstream rename', '@opentelemetry/instrumentation-openai-v2'],
  ])('%s: %s is accepted and disables nothing', (_label, key) => {
    const { code, names, output } = rosterWithKey(key);

    if (code !== 0) {
      throw new Error(`${BITE_CONDITION}\n\nchild exit=${String(code)}\n${output}`);
    }
    expect(code).toBe(0);
    expect(names).toContain(OPENAI_INSTRUMENTATION);
  });
});
