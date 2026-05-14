/**
 * A6 — Citation chip telemetry (V1 = console.debug only, Q5 decision).
 *
 * Logs one `citation_chips_rendered` event per assistant message rendered
 * with non-empty chips. Payload schema is PII-safe : counts + level only,
 * NEVER source URLs / titles / quotes (NFR5).
 *
 * Sentry breadcrumb is DEFERRED to V1.1+ (Open Q5 in A6.md). For V1 we
 * stay on `console.debug` — zero new infra, zero PII risk, visible in dev.
 */

import type { CitationChipModel, ConfidenceLevel } from './citations';

export interface CitationTelemetryPayload {
  readonly family_count: number;
  readonly confidence_level: ConfidenceLevel;
  readonly has_sources: boolean;
}

/**
 * Emit a single `citation_chips_rendered` telemetry event derived from the
 * chip-cluster view-model. No-op if `models` is empty (defensive guard).
 */
export function logCitationResolution(
  models: readonly CitationChipModel[],
  hasSources: boolean,
): void {
  if (models.length === 0) return;
  const family_count = models.filter((m) => m.kind === 'provenance').length;
  const confidenceModel = models.find(
    (m): m is Extract<CitationChipModel, { kind: 'confidence' }> => m.kind === 'confidence',
  );
  const confidence_level: ConfidenceLevel = confidenceModel?.level ?? 'low';
  console.debug('[chat.citations] citation_chips_rendered', {
    family_count,
    confidence_level,
    has_sources: hasSources,
  } satisfies CitationTelemetryPayload);
}
