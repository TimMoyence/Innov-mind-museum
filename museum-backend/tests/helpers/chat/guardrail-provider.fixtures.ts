import type {
  GuardrailProvider,
  GuardrailVerdict,
  ProviderHealth,
  ProviderMetricsSnapshot,
} from '@modules/chat/domain/ports/guardrail-provider.port';

/**
 * RUN_ID 2026-05-31-e2e-guardrail-blindspot — deterministic fake V2
 * {@link GuardrailProvider} for the guardrail-chain e2e suite.
 *
 * Implements the REAL port (`domain/ports/guardrail-provider.port.ts`). When
 * `block: true`, `checkInput` returns `{ allow: false, reason: 'prompt_injection' }`
 * so `GuardrailEvaluationService.evaluateInput` short-circuits BEFORE the
 * orchestrator (`guardrail-evaluation.service.ts:152-163`) — proving the V2
 * provider deny-path is wired end-to-end (Case D). `checkOutput` always allows
 * (the suite exercises the output path via the keyword guardrail, not the
 * provider). `health` / `metrics` are benign no-ops to satisfy the interface.
 *
 * DRY factory (docs/TEST_FACTORIES.md). No inline port objects — every
 * GuardrailProvider used by a test comes from this factory.
 */

export interface MakeFakeGuardrailProviderOptions {
  /** When true, `checkInput` denies (Case D). When false, it allows. */
  block: boolean;
}

/**
 * Builds a fake {@link GuardrailProvider}.
 * @param options `{ block }` — controls whether `checkInput` denies.
 */
export const makeFakeGuardrailProvider = (
  options: MakeFakeGuardrailProviderOptions,
): GuardrailProvider => ({
  name: 'fake-guardrail-provider',
  version: 'fake-guardrail-provider-test-v1',

  checkInput(): Promise<GuardrailVerdict> {
    if (options.block) {
      return Promise.resolve({
        version: 'v1',
        allow: false,
        reason: 'prompt_injection',
        confidence: 1,
        providedBy: { name: 'fake-guardrail-provider', version: 'fake-guardrail-provider-test-v1' },
      });
    }
    return Promise.resolve({ version: 'v1', allow: true });
  },

  checkOutput(): Promise<GuardrailVerdict> {
    return Promise.resolve({ version: 'v1', allow: true });
  },

  health(): Promise<ProviderHealth> {
    return Promise.resolve({
      status: 'up',
      latencyMs: 0,
      lastCheckedAt: new Date().toISOString(),
    });
  },

  metrics(): ProviderMetricsSnapshot {
    return { requests: 0, blocks: 0, errors: 0 };
  },
});
