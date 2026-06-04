/**
 * TD-63 — DETERMINISTIC fail-CLOSED / fail-OPEN invariants for the V2 guardrail
 * layers (ADR-047). Unlike `guardrail-v2-live.ai.test.ts`, this suite has NO
 * external dependency: no sidecar, no OPENAI_API_KEY, no network, no
 * RUN_AI_TESTS guard. It exists so a BLOCKING CI job can validate the security
 * invariants on every backend change — the live suite is advisory because it
 * hits OpenAI and a real ProtectAI sidecar (non-deterministic, env-bound).
 *
 * The 44/44 conversation matrix never reaches these two layers; the live suite
 * proves them under real services but is swallowed by `continue-on-error: true`
 * (ci-cd-backend.yml `ai-tests` job). This file is the GREEN, hard-gated proof.
 *
 * Why it lives under tests/ai/: jest.config.ts:58 ignores `/tests/ai/` for the
 * default `unit-integration` project, so it only runs when invoked with the CLI
 * override `--testPathIgnorePatterns '/dist/' '/node_modules/'` (exactly the
 * trick `test:ai` uses, package.json). The dedicated blocking CI job replicates
 * that flag so this file is picked up; a normal `pnpm test` leaves it ignored.
 *
 * The 4th block is a STRUCTURAL probe over ci-cd-backend.yml asserting that a
 * BLOCKING job (no `continue-on-error`) actually runs THIS file — RED until the
 * job is added (TD-63 fix), GREEN afterwards. No YAML lib (js-yaml/yaml are both
 * unresolvable from any app node_modules) → constrained line/regex parser over
 * readFileSync, mirroring scripts/__tests__/ops-infra-ci-gates.test.mjs.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { __setStoreForTest } from '@modules/chat/useCase/guardrail/guardrail-budget';
import { judgeWithLlm } from '@modules/chat/useCase/llm/llm-judge-guardrail';
import { LLMGuardAdapter } from '@modules/chat/adapters/secondary/guardrails/llm-guard.adapter';

import type { ChatModel } from '@modules/chat/domain/llm/chat-model.port';
import type { IGuardrailBudgetStore } from '@modules/chat/useCase/guardrail/guardrail-budget';

// -----------------------------------------------------------------------------
// 1. SIDECAR adapter — fail-CLOSED when unreachable (no sidecar, no network).
//    127.0.0.1:9 is the "discard" port — connection refused / aborted fast.
// -----------------------------------------------------------------------------
describe('TD-63 — LLM-Guard sidecar fail-CLOSED (deterministic, no sidecar)', () => {
  it('FAIL-CLOSED: a dead URL denies (allow=false, reason=error), never allows', async () => {
    const dead = new LLMGuardAdapter({ baseUrl: 'http://127.0.0.1:9', timeoutMs: 800 });
    const verdict = await dead.checkInput({ text: 'Who painted the Mona Lisa?' });
    // ADR-047 security invariant: an unreachable sidecar MUST deny, never allow.
    expect(verdict.allow).toBe(false);
    expect(verdict.reason).toBe('error');
  });
});

// -----------------------------------------------------------------------------
// 2. JUDGE — fail-OPEN (returns null → caller falls back to V1 keyword path).
//    Both paths short-circuit BEFORE any model call → no OPENAI_API_KEY, no
//    token spend.
// -----------------------------------------------------------------------------
describe('TD-63 — LLM judge fail-OPEN (deterministic, no OpenAI key)', () => {
  afterEach(() => {
    __setStoreForTest(null); // restore the real (env-selected) budget store
  });

  it('FAIL-OPEN: budget exhausted → judge returns null with NO model call', async () => {
    const exhausted: IGuardrailBudgetStore = {
      recordCost: async () => undefined,
      cumulativeCents: async () => 1_000_000, // far above any cap
      reset: async () => undefined,
    };
    __setStoreForTest(exhausted);

    // A stub model that would THROW if invoked — proves the budget gate
    // short-circuits to null BEFORE touching the model (no token spend, fail-OPEN).
    const explodingModel = {
      withStructuredOutput: () => {
        throw new Error('judge must NOT call the model when the budget is exhausted');
      },
    } as unknown as ChatModel;

    const decision = await judgeWithLlm('Tell me the weather in Bordeaux tomorrow please.', {
      model: explodingModel,
    });
    expect(decision).toBeNull();
  });

  it('FAIL-OPEN: misconfigured (no model injected) → judge returns null', async () => {
    // Fresh non-exhausted budget so the misconfigured path is the one exercised.
    const fresh: IGuardrailBudgetStore = {
      recordCost: async () => undefined,
      cumulativeCents: async () => 0,
      reset: async () => undefined,
    };
    __setStoreForTest(fresh);

    const decision = await judgeWithLlm('Tell me about Claude Monet in detail please.');
    expect(decision).toBeNull();
  });
});

// -----------------------------------------------------------------------------
// 3. STRUCTURAL probe — a BLOCKING CI job must run THIS deterministic file.
//    Guards against the TD-63 regression: the only path that exercised the
//    fail-CLOSED invariant (ai-tests) is `continue-on-error: true` (advisory),
//    so a broken invariant would never fail a merge. RED until the fix lands.
// -----------------------------------------------------------------------------
describe('TD-63 — CI structurally hard-gates the fail-CLOSED invariant', () => {
  // cwd === <repo>/museum-backend (jest defaults.run.working-directory), so the
  // workflow lives one level up. readFileSync resolution verified.
  const workflow = readFileSync(
    resolve(process.cwd(), '..', '.github', 'workflows', 'ci-cd-backend.yml'),
    'utf8',
  );
  const DETERMINISTIC_FILE = 'guardrail-failclosed-deterministic';

  // Extract the contiguous block of the dedicated job by name. A job block runs
  // from its `<name>:` header (2-space indent) to the next 2-space `<name>:`.
  const jobBlock = (jobName: string): string => {
    const lines = workflow.split('\n');
    const header = new RegExp(`^  ${jobName}:\\s*$`);
    const nextJob = /^  [A-Za-z0-9_-]+:\s*$/;
    const start = lines.findIndex((l) => header.test(l));
    if (start === -1) return '';
    let end = lines.length;
    for (let i = start + 1; i < lines.length; i++) {
      if (nextJob.test(lines[i])) {
        end = i;
        break;
      }
    }
    return lines.slice(start, end).join('\n');
  };

  it('declares a `guardrail-failclosed` BLOCKING job that runs the deterministic file', () => {
    const block = jobBlock('guardrail-failclosed');
    // The job must exist...
    expect(block).not.toBe('');
    // ...and must invoke jest on the deterministic file with the ai-path
    // override (so jest.config.ts:58 ignore is lifted for it).
    expect(block).toContain(DETERMINISTIC_FILE);
  });

  it('the guardrail-failclosed job is NOT continue-on-error (it is a hard gate)', () => {
    const block = jobBlock('guardrail-failclosed');
    expect(block).not.toBe('');
    // ADR-047 / TD-63: the fail-CLOSED invariant MUST block a merge. Mirror of
    // ops-infra-ci-gates.test.mjs (W1b): assert the job body never opts out.
    expect(/continue-on-error:\s*true/.test(block)).toBe(false);
  });
});
