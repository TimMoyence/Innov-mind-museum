import {
  guardrailCategoryBlocksTotal,
  guardrailDecisionsTotal,
} from '@shared/observability/prometheus-metrics';

import type { GuardrailBlockReason } from '../art-topic-guardrail';
import type { GuardrailAuditContext } from '../guardrail-audit-payload';

/** Closed set of layers exposed as a Prometheus label (bounded cardinality). */
export type GuardrailLayer = 'keyword' | 'provider' | 'judge' | 'classifier';

/** Closed set of locale labels (8 supported + `unknown`). */
const KNOWN_LOCALES: ReadonlySet<string> = new Set([
  'ar',
  'de',
  'en',
  'es',
  'fr',
  'it',
  'ja',
  'zh',
]);

/**
 * Resolves a Prometheus-safe locale label from the audit context. Clips to
 * the closed 8-locale set + `unknown` to keep cardinality bounded — a hostile
 * client cannot inflate label cardinality by sending arbitrary locale strings.
 */
export function resolveLocaleLabel(context: GuardrailAuditContext | undefined): string {
  const raw = context?.locale?.toLowerCase();
  if (raw && KNOWN_LOCALES.has(raw)) return raw;
  return 'unknown';
}

/**
 * Increments the bias-monitoring counters at decision time. Foundation for
 * `docs/compliance/FAIRNESS_METRICS_PLAN.md` Phase 1 — per-locale block-rate
 * derivation in Prometheus uses these as the base series. Methodology note:
 * baseline for alerts is `avg(block_rate per locale)`, NOT global
 * `total_blocks / total_requests` (a single locale dominating blocks would
 * contaminate the global mean, hiding per-locale anomalies).
 */
export function recordBiasMetrics(params: {
  locale: string;
  layer: GuardrailLayer;
  decision: { allow: boolean; reason?: GuardrailBlockReason };
}): void {
  const decisionLabel = params.decision.allow ? 'allowed' : 'blocked';
  guardrailDecisionsTotal.inc({
    locale: params.locale,
    layer: params.layer,
    decision: decisionLabel,
  });
  if (!params.decision.allow && params.decision.reason) {
    guardrailCategoryBlocksTotal.inc({
      locale: params.locale,
      category: params.decision.reason,
    });
  }
}
