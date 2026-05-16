import { buildGuardrailInputRedactedAuditEntry } from '@modules/chat/useCase/guardrail/guardrail-audit-payload';
import { logger } from '@shared/logger/logger';
import { guardrailPiiRedactedTotal } from '@shared/observability/prometheus-metrics';

import type { GuardrailProvider } from '@modules/chat/domain/ports/guardrail-provider.port';
import type { GuardrailAuditContext } from '@modules/chat/useCase/guardrail/guardrail-audit-payload';
import type { AuditService } from '@shared/audit/audit.service';

/**
 * Extracts entity-type labels from Presidio `<ENTITY_N>` placeholders.
 *
 * `<EMAIL_ADDRESS_1>` → `EMAIL_ADDRESS`. Duplicates are preserved so the
 * caller can `.inc()` the Prometheus counter once per placeholder occurrence
 * (a single message with 2 emails should produce a counter delta of 2).
 *
 * Mirrors the Anonymize scanner contract from `museum-backend/ops/llm-guard-sidecar/app.py`.
 */
export function extractPlaceholderTypes(redactedText: string): string[] {
  const re = /<([A-Z_]+)_\d+>/g;
  const types: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(redactedText)) !== null) {
    types.push(match[1]);
  }
  return types;
}

/**
 * LLM02 — emits the hash-chained audit row + Prometheus counter for an
 * effective PII redaction. Called by `evaluateInput` only when the provider
 * returned a `redactedText` that differs from the input.
 *
 * Receives only the post-scrub text; the original PII never reaches this
 * code path, so no leak is structurally possible.
 */
export async function logInputRedaction(params: {
  redactedText: string;
  locale: string;
  provider: GuardrailProvider;
  audit?: AuditService;
  context?: GuardrailAuditContext;
}): Promise<void> {
  const { redactedText, locale, provider, audit, context } = params;
  const placeholderTypes = extractPlaceholderTypes(redactedText);
  const placeholderCount = placeholderTypes.length;
  if (placeholderCount === 0) return;

  for (const type of placeholderTypes) {
    guardrailPiiRedactedTotal.inc({ locale, placeholder_type: type });
  }

  logger.info('guardrail_input_redacted', {
    phase: 'input',
    placeholder_count: placeholderCount,
    provider: provider.name,
  });

  if (audit) {
    await audit.log(
      buildGuardrailInputRedactedAuditEntry({
        redactedText,
        placeholderCount,
        providerName: provider.name,
        providerVersion: provider.version,
        context,
      }),
    );
  }
}
