/**
 * Bias-monitoring metrics integration test — Phase 1 perennial design.
 *
 * Verifies the two counters exposed in `prometheus-metrics.ts`
 * (`musaium_guardrail_decisions_total{locale, layer, decision}` +
 * `musaium_guardrail_category_blocks_total{locale, category}`) are incremented
 * at the right decision points inside `GuardrailEvaluationService.evaluateInput`.
 *
 * Methodology guard-rail (research subagent finding) — locale label is clipped
 * to the closed 8-locale set + `unknown`; arbitrary user-supplied locale strings
 * collapse to `unknown` so cardinality stays bounded under hostile traffic.
 * @see docs/compliance/FAIRNESS_METRICS_PLAN.md
 * @see docs/observability/alerts-llm-guard.yml (BiasLocalBlockRateDrift)
 */
import { GuardrailEvaluationService } from '@modules/chat/useCase/guardrail/guardrail-evaluation.service';
import {
  guardrailCategoryBlocksTotal,
  guardrailDecisionsTotal,
} from '@shared/observability/prometheus-metrics';

interface CounterValue {
  value: number;
  labels: Record<string, string>;
}

async function readSeries(counter: typeof guardrailDecisionsTotal): Promise<CounterValue[]> {
  const metric = await counter.get();
  return metric.values.map((v) => ({ value: v.value, labels: v.labels as Record<string, string> }));
}

function findSeries(values: CounterValue[], labels: Record<string, string>): number {
  const match = values.find((v) =>
    Object.entries(labels).every(([k, want]) => v.labels[k] === want),
  );
  return match?.value ?? 0;
}

describe('guardrail bias metrics — recordBiasMetrics wiring', () => {
  beforeEach(() => {
    guardrailDecisionsTotal.reset();
    guardrailCategoryBlocksTotal.reset();
  });

  /**
   * Helper: builds a minimal `GuardrailEvaluationService` whose dependencies
   * never block. The only effect we exercise is the keyword pre-filter +
   * the bias-counter wiring at every return point.
   */
  const buildService = (): GuardrailEvaluationService =>
    new GuardrailEvaluationService({
      repository: {
        saveBlockedMessage: jest.fn().mockResolvedValue(undefined),
        saveMessage: jest.fn().mockResolvedValue(undefined),
      } as never,
      audit: { log: jest.fn().mockResolvedValue(undefined) } as never,
      llmJudgeEnabled: false,
      guardrailProvider: undefined,
      guardrailProviderObserveOnly: true,
    });

  it('increments decisions_total{decision="allowed"} on a clean input', async () => {
    const svc = buildService();
    await svc.evaluateInput('Tell me about the Mona Lisa', undefined, { locale: 'en' });

    const values = await readSeries(guardrailDecisionsTotal);
    expect(findSeries(values, { locale: 'en', decision: 'allowed' })).toBeGreaterThan(0);
  });

  it('increments decisions_total{decision="blocked"} + category_blocks_total on an insult', async () => {
    const svc = buildService();
    await svc.evaluateInput('fuck you', undefined, { locale: 'fr' });

    const decisions = await readSeries(guardrailDecisionsTotal);
    const categories = await readSeries(guardrailCategoryBlocksTotal);
    expect(findSeries(decisions, { locale: 'fr', decision: 'blocked' })).toBeGreaterThan(0);
    // The block category may be 'insult' / 'off_topic' depending on the keyword filter
    // — we only assert that some category-block was recorded for FR.
    const frBlocks = categories.filter((v) => v.labels.locale === 'fr');
    expect(frBlocks.reduce((s, v) => s + v.value, 0)).toBeGreaterThan(0);
  });

  it('clips unknown locales to "unknown" (bounded cardinality)', async () => {
    const svc = buildService();
    await svc.evaluateInput('hello there', undefined, { locale: 'klingon' });

    const values = await readSeries(guardrailDecisionsTotal);
    expect(findSeries(values, { locale: 'unknown', decision: 'allowed' })).toBeGreaterThan(0);
    expect(findSeries(values, { locale: 'klingon', decision: 'allowed' })).toBe(0);
  });

  it('clips missing locale to "unknown"', async () => {
    const svc = buildService();
    await svc.evaluateInput('hi', undefined, undefined);

    const values = await readSeries(guardrailDecisionsTotal);
    expect(findSeries(values, { locale: 'unknown', decision: 'allowed' })).toBeGreaterThan(0);
  });

  it('accepts all 8 known locales without coercion', async () => {
    const svc = buildService();
    for (const locale of ['ar', 'de', 'en', 'es', 'fr', 'it', 'ja', 'zh']) {
      await svc.evaluateInput('art question', undefined, { locale });
    }
    const values = await readSeries(guardrailDecisionsTotal);
    for (const locale of ['ar', 'de', 'en', 'es', 'fr', 'it', 'ja', 'zh']) {
      expect(findSeries(values, { locale, decision: 'allowed' })).toBeGreaterThan(0);
    }
  });
});
