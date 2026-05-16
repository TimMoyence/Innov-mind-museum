/**
 * LLM02 (2026-05-14) — PII redaction propagation E2E.
 *
 * Drives the chat HTTP pipeline end-to-end against a real Postgres testcontainer
 * with both the `GuardrailProvider` and the `ChatOrchestrator` mocked.
 *
 * The forensic contract: when the guardrail provider returns a sanitized
 * version of the user input (Anonymize / Presidio), the chat orchestrator
 * MUST receive the placeholder-only version — the raw PII MUST never reach
 * the LLM and MUST NEVER appear in the hash-chained audit row.
 *
 * Acceptance criteria covered (cf. team-state/2026-05-14-pii-redaction-llm02/spec.md §3):
 *   - R4 — `OrchestratorInput.text` received by the LLM equals `redactedText`.
 *   - R5 — audit chain receives a `GUARDRAIL_INPUT_REDACTED` row with
 *          `metadata.pii_redacted === true`.
 *   - R6 — neither the LLM payload nor the audit row contains the raw PII tokens.
 *
 * Gated on `RUN_E2E=true`. Local dev opts in via:
 *
 *   RUN_E2E=true pnpm jest --runInBand tests/e2e/chat-pii-redaction.e2e.test.ts
 */

import { createE2EHarness, E2EHarness } from 'tests/helpers/e2e/e2e-app-harness';
import { registerAndLogin } from 'tests/helpers/e2e/e2e-auth.helpers';

import type {
  ChatOrchestrator,
  OrchestratorInput,
  OrchestratorOutput,
} from '@modules/chat/domain/ports/chat-orchestrator.port';
import type {
  GuardrailProvider,
  GuardrailVerdict,
} from '@modules/chat/domain/ports/guardrail-provider.port';
import type { AuditLogEntry } from '@shared/audit/audit.types';
import type { AuditService } from '@shared/audit/audit.service';

const shouldRunE2E = process.env.RUN_E2E === 'true';
const describeE2E = shouldRunE2E ? describe : describe.skip;

const PII_EMAIL = 'tim@example.com';
const PII_CARD = '4111-1111-1111-1111';
const RAW_INPUT = `mon email est ${PII_EMAIL} et carte ${PII_CARD}`;
const REDACTED_INPUT = 'mon email est <EMAIL_ADDRESS_1> et carte <CREDIT_CARD_1>';

/**
 * Fake LLM-Guard adapter that returns a pre-canned sanitized prompt. Matches
 * the production contract from `museum-backend/src/modules/chat/adapters/secondary/guardrails/llm-guard.adapter.ts:410-429`.
 */
function makeFakeGuardrailProvider(): GuardrailProvider {
  return {
    name: 'fake-llm-guard',
    version: 'fake-v1',
    async checkInput(): Promise<GuardrailVerdict> {
      return Promise.resolve({
        version: 'v1',
        allow: true,
        redactedText: REDACTED_INPUT,
      });
    },
    async checkOutput(): Promise<GuardrailVerdict> {
      return Promise.resolve({ version: 'v1', allow: true });
    },
    async health() {
      return Promise.resolve({
        status: 'up' as const,
        latencyMs: 0,
        lastCheckedAt: new Date().toISOString(),
      });
    },
    metrics() {
      return { requests: 0, blocks: 0, errors: 0 };
    },
  };
}

/**
 * Capturing orchestrator records the exact `OrchestratorInput.text` the chat
 * pipeline forwards. Test assertions then prove the value is the placeholder
 * version, never the raw PII.
 */
class CapturingOrchestrator implements ChatOrchestrator {
  public readonly capturedInputs: OrchestratorInput[] = [];

  // eslint-disable-next-line @typescript-eslint/require-await -- port signature is async
  async generate(input: OrchestratorInput): Promise<OrchestratorOutput> {
    this.capturedInputs.push(input);
    return {
      text: 'Synthetic assistant response',
      metadata: {},
    };
  }

  async generateStream(
    input: OrchestratorInput,
    onChunk: (text: string) => void,
  ): Promise<OrchestratorOutput> {
    this.capturedInputs.push(input);
    const output = await this.generate(input);
    onChunk(output.text);
    return output;
  }
}

/** Capturing audit service to assert the hash-chained redaction row. */
function makeCapturingAuditService(): { audit: AuditService; entries: AuditLogEntry[] } {
  const entries: AuditLogEntry[] = [];
  const audit = {
    // eslint-disable-next-line @typescript-eslint/require-await -- mock signature
    async log(entry: AuditLogEntry): Promise<void> {
      entries.push(entry);
    },
    // eslint-disable-next-line @typescript-eslint/require-await -- mock signature
    async logBatch(es: AuditLogEntry[]): Promise<void> {
      entries.push(...es);
    },
  } as unknown as AuditService;
  return { audit, entries };
}

describeE2E('chat e2e — PII redaction propagation (LLM02)', () => {
  jest.setTimeout(180_000);

  let harness: E2EHarness;
  let orchestrator: CapturingOrchestrator;
  let auditEntries: AuditLogEntry[];

  beforeAll(async () => {
    orchestrator = new CapturingOrchestrator();
    const auditMock = makeCapturingAuditService();
    auditEntries = auditMock.entries;

    harness = await createE2EHarness({
      chatOrchestratorOverride: orchestrator,
      guardrailProviderOverride: makeFakeGuardrailProvider(),
      auditServiceOverride: auditMock.audit,
    });
  });

  afterAll(async () => {
    await harness?.stop();
  });

  it('substitutes redactedText into the LLM HumanMessage and writes a pii_redacted audit row', async () => {
    const { token } = await registerAndLogin(harness);

    const createRes = await harness.request(
      '/api/chat/sessions',
      { method: 'POST', body: JSON.stringify({ locale: 'fr', museumMode: false }) },
      token,
    );
    expect(createRes.status).toBe(201);
    const sessionId = (createRes.body as { session: { id: string } }).session.id;

    const postRes = await harness.request(
      `/api/chat/sessions/${sessionId}/messages`,
      {
        method: 'POST',
        body: JSON.stringify({
          text: RAW_INPUT,
          context: { locale: 'fr' },
        }),
      },
      token,
    );
    expect(postRes.status).toBe(201);

    // R4 — the LLM receives the scrubbed version, never the raw PII.
    expect(orchestrator.capturedInputs).toHaveLength(1);
    const llmInput = orchestrator.capturedInputs[0];
    expect(llmInput.text).toBe(REDACTED_INPUT);
    expect(llmInput.text).not.toContain(PII_EMAIL);
    expect(llmInput.text).not.toContain(PII_CARD);

    // R5 — the redaction audit row is emitted with pii_redacted=true.
    const redactionEntries = auditEntries.filter((e) => e.action === 'GUARDRAIL_INPUT_REDACTED');
    expect(redactionEntries).toHaveLength(1);
    const meta = redactionEntries[0].metadata!;
    expect(meta.pii_redacted).toBe(true);
    expect(meta.placeholder_count).toBe(2);
    expect(meta.locale).toBe('fr');

    // R6 — the raw PII tokens must NOT appear anywhere in the audit chain.
    const serialized = JSON.stringify(redactionEntries[0]);
    expect(serialized).not.toContain(PII_EMAIL);
    expect(serialized).not.toContain(PII_CARD);
  });
});
