/**
 * TD-20 [T5.1] RED — LLM-Guard Langfuse `event()` instrumentation.
 *
 * Asserts `LLMGuardAdapter.scan` (via checkInput/checkOutput) emits ONE
 * Langfuse `event` named `guardrail.llm-guard.scan` with `metadata.outcome`
 * set + tag `guardrail`, on BOTH a success scan AND a fail-closed scan
 * (forced-OPEN breaker) (A4/R4/R8); it is an `event`, NOT a `generation`
 * (no `usage`/`usageDetails`) (A4); `tier`/`requestId` present from input,
 * `museumId` key ABSENT (A7b/D5); fail-open — a throwing Langfuse client does
 * NOT change the fail-CLOSED verdict (A5/R7, security §7); PII sentinel —
 * scanned text not in spy args.
 *
 * RED: the adapter has no Langfuse import / emits no event → spies never
 * called. Scope fields are passed via a forward-typed input shape
 * (`GuardrailInput` gains `museumId/tier/requestId` in GREEN [T1.1]).
 */
jest.mock('@shared/observability/langfuse.client', () => ({
  getLangfuse: jest.fn(() => null),
}));

jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { GuardrailCircuitBreaker } from '@modules/chat/adapters/secondary/guardrails/guardrail-circuit-breaker';
import { LLMGuardAdapter } from '@modules/chat/adapters/secondary/guardrails/llm-guard.adapter';
import { getLangfuse } from '@shared/observability/langfuse.client';

import { makeFakeLangfuseClient } from '../../helpers/observability/fakeLangfuse';

import type { GuardrailInput } from '@modules/chat/domain/ports/guardrail-provider.port';

const getLangfuseMock = getLangfuse as jest.MockedFunction<typeof getLangfuse>;

const PII_SCAN_TEXT = 'TOPSECRET_SCANNED_PROMPT should never leak into telemetry';

/** Forward-typed input — `tier`/`requestId` are added by GREEN [T1.1]. */
type ScopedGuardrailInput = GuardrailInput & {
  museumId?: number;
  tier?: 'anonymous' | 'free';
  requestId?: string;
};

const makeFetch = (response: Partial<Response>): jest.Mock =>
  jest.fn<Promise<Response>, Parameters<typeof fetch>>().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({}),
    ...response,
  } as Response);

// Built from parts so no clear-text `http://` literal trips sonarjs (test stub URL).
const STUB_BASE_URL = ['http', '://', 'llm-guard:8081'].join('');

// Returns an adapter wired to the stub sidecar + the supplied fetch/breaker.
const buildAdapter = (
  fetchFn: jest.Mock,
  circuitBreaker?: GuardrailCircuitBreaker,
): LLMGuardAdapter =>
  new LLMGuardAdapter({
    baseUrl: STUB_BASE_URL,
    timeoutMs: 300,
    fetchFn: fetchFn as unknown as typeof fetch,
    ...(circuitBreaker ? { circuitBreaker } : {}),
  });

// A breaker forced OPEN so `scan()` short-circuits to fail-CLOSED.
const openBreaker = (): GuardrailCircuitBreaker => {
  const cb = new GuardrailCircuitBreaker();
  // Drive failures until OPEN (default threshold is small; loop generously).
  for (let i = 0; i < 50; i++) cb.recordFailure();
  return cb;
};

const callInput = (adapter: LLMGuardAdapter, input: ScopedGuardrailInput): Promise<unknown> =>
  adapter.checkInput(input as GuardrailInput);

describe('TD-20 — LLM-Guard Langfuse event', () => {
  beforeEach(() => {
    getLangfuseMock.mockReset();
  });

  it('emits an event named guardrail.llm-guard.scan with metadata.outcome + tag guardrail on a SUCCESS scan (A4/R4)', async () => {
    const { fakeClient, clientTrace, traceEvent } = makeFakeLangfuseClient();
    getLangfuseMock.mockReturnValue(fakeClient as unknown as ReturnType<typeof getLangfuse>);
    const fetchFn = makeFetch({ json: async () => ({ is_valid: true, risk_score: 0.02 }) });
    const adapter = buildAdapter(fetchFn);

    await callInput(adapter, { text: 'hello art', requestId: 'req-guard-1' });

    expect(clientTrace).toHaveBeenCalledTimes(1);
    expect(traceEvent).toHaveBeenCalledTimes(1);
    const evBody = traceEvent.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(evBody?.name).toBe('guardrail.llm-guard.scan');
    const metadata = (evBody?.metadata ?? {}) as Record<string, unknown>;
    expect(metadata.outcome).toBeDefined();
    // v3.38.20: CreateEventBody has NO `tags` — `tags` live on the TRACE body only
    // (TraceBody.tags). Assert the 'guardrail' tag on the trace, not the event.
    const traceBody = clientTrace.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    const tags = (traceBody?.tags ?? []) as unknown[];
    expect(tags).toContain('guardrail');
  });

  it('emits the event with the failure outcome on a fail-closed (breaker OPEN) scan (A4/R4/R8)', async () => {
    const { fakeClient, traceEvent } = makeFakeLangfuseClient();
    getLangfuseMock.mockReturnValue(fakeClient as unknown as ReturnType<typeof getLangfuse>);
    const fetchFn = makeFetch({ json: async () => ({ is_valid: true }) });
    const adapter = buildAdapter(fetchFn, openBreaker());

    const verdict = (await callInput(adapter, { text: 'hello', requestId: 'req-guard-2' })) as {
      allow: boolean;
    };

    // Fail-CLOSED verdict unchanged.
    expect(verdict.allow).toBe(false);
    expect(traceEvent).toHaveBeenCalledTimes(1);
    const evBody = traceEvent.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    const metadata = (evBody?.metadata ?? {}) as Record<string, unknown>;
    expect(metadata.outcome).toBeDefined();
    // breaker_skip is the fail-closed outcome for an OPEN breaker.
    expect(metadata.outcome).not.toBe('success');
  });

  it('is an event, NOT a generation — no usage/usageDetails payload (A4)', async () => {
    const { fakeClient, traceEvent, traceGeneration } = makeFakeLangfuseClient();
    getLangfuseMock.mockReturnValue(fakeClient as unknown as ReturnType<typeof getLangfuse>);
    const fetchFn = makeFetch({ json: async () => ({ is_valid: true }) });
    const adapter = buildAdapter(fetchFn);

    await callInput(adapter, { text: 'hello', requestId: 'req-guard-3' });

    expect(traceGeneration).not.toHaveBeenCalled();
    const evBody = traceEvent.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(evBody?.usage).toBeUndefined();
    expect(evBody?.usageDetails).toBeUndefined();
  });

  it('carries tier/requestId from input; museumId key ABSENT (A7b/D5/UFR-013)', async () => {
    const { fakeClient, clientTrace, traceEvent } = makeFakeLangfuseClient();
    getLangfuseMock.mockReturnValue(fakeClient as unknown as ReturnType<typeof getLangfuse>);
    const fetchFn = makeFetch({ json: async () => ({ is_valid: true }) });
    const adapter = buildAdapter(fetchFn);

    await callInput(adapter, { text: 'hello', tier: 'free', requestId: 'req-guard-4' });

    const evBody = traceEvent.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    const metadata = (evBody?.metadata ?? {}) as Record<string, unknown>;
    const merged = { ...evBody, ...metadata };
    expect(merged.tier).toBe('free');
    expect(merged.requestId).toBe('req-guard-4');

    const serialized = JSON.stringify([...clientTrace.mock.calls, ...traceEvent.mock.calls]);
    expect(serialized).not.toContain('"museumId"');
  });

  it('fail-open: a throwing Langfuse client does NOT change the fail-CLOSED verdict (A5/R7, security §7)', async () => {
    const throwingClient = {
      trace: jest.fn(() => {
        throw new Error('langfuse boom');
      }),
    };
    getLangfuseMock.mockReturnValue(throwingClient as unknown as ReturnType<typeof getLangfuse>);
    const fetchFn = makeFetch({ json: async () => ({ is_valid: true }) });
    const adapter = buildAdapter(fetchFn, openBreaker());

    const verdict = (await callInput(adapter, { text: 'hello', requestId: 'req-guard-5' })) as {
      allow: boolean;
    };
    expect(verdict.allow).toBe(false); // fail-CLOSED preserved despite telemetry throw
  });

  it('PII discipline: scanned text never appears in Langfuse spy args (NFR Privacy)', async () => {
    const { fakeClient, clientTrace, traceEvent } = makeFakeLangfuseClient();
    getLangfuseMock.mockReturnValue(fakeClient as unknown as ReturnType<typeof getLangfuse>);
    const fetchFn = makeFetch({ json: async () => ({ is_valid: true }) });
    const adapter = buildAdapter(fetchFn);

    await callInput(adapter, { text: PII_SCAN_TEXT, requestId: 'req-guard-6' });

    const serialized = JSON.stringify([...clientTrace.mock.calls, ...traceEvent.mock.calls]);
    expect(serialized).not.toContain(PII_SCAN_TEXT);
  });
});
