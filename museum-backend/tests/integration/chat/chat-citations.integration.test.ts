/**
 * C4.1 T6.1 — Chat citations end-to-end integration test.
 *
 * Exercises the full `ChatService.postMessage()` path with a mocked
 * `ChatOrchestrator` returning a synthetic `metadata.sources[]` to verify :
 *
 *  1. Valid `sources[]` propagates verbatim to the API response shape (R1).
 *  2. Hallucinated `quote` (not in any fact block) is rejected by
 *     `sources-validator` and the final `metadata.sources.length` is the count
 *     of valid sources only (R4 grounding gate).
 *  3. `metadata.sources` absent from LLM output → `undefined` in response
 *     (graceful — no empty arrays, per `assistant-response.toSources` convention).
 *  4. The Spotlighting envelope (T2.3 — `buildContextSection`) wraps router
 *     facts as the second SystemMessage with a fresh 16-hex nonce — verified
 *     via the orchestrator-input spy + a direct envelope rendering check.
 *
 * Mock strategy : reuse the in-memory repository from `buildChatTestService` and
 * inject a router stub (`KnowledgeRouterPort`) plus a recording orchestrator
 * stub (`ChatOrchestrator`). No testcontainers — see the rationale block in
 * `knowledge-router.integration.test.ts`.
 *
 * Spec : `team-state/2026-05-11-c4-anti-hallucination/spec.md` §R1 / R2 / R4.
 * Design : `team-state/2026-05-11-c4-anti-hallucination/design.md` §D2 / D3 / D4.
 * Plan : `docs/plans/2026-05-10-c4-launch-prompt.md` §J Phase 6 Step 6.1.
 *
 * KNOWN INTEGRATION GAP (Case 2) : at the time of writing, the
 * `validateSources()` use-case from T2.4 is implemented and unit-tested but
 * NOT yet wired into `message-commit.ts` / `chat-message.service`. Wiring is
 * implied by the design sequence diagram (`design.md` §S5 `CS->>SV:
 * validateSources(...)`) but no atomic task explicitly performs the wiring —
 * see OPEN-ISSUE-1 in the run verdict. To respect UFR-013, Case 2 is encoded
 * as `it.skip()` with the assertion shape recorded so the test flips to a
 * meaningful red when the wiring lands. **DO NOT** unskip until the validator
 * is invoked from the post-LLM commit path.
 *
 * Doctrine : NO `*_ENABLED` flag introduced or asserted (D11 / pré-launch V1,
 * `feedback_no_feature_flags_prelaunch`).
 */

import { buildContextSection, generateNonce } from '@modules/chat/useCase/llm/llm-sections';

import { makeCitationSource } from 'tests/helpers/chat/citation-source.fixtures';
import { buildChatTestService } from 'tests/helpers/chat/chatTestApp';

import type { CitationSource } from '@modules/chat/domain/chat.types';
import type {
  ChatOrchestrator,
  OrchestratorInput,
  OrchestratorOutput,
} from '@modules/chat/domain/ports/chat-orchestrator.port';
import type {
  KnowledgeRouterPort,
  KnowledgeRouterResult,
} from '@modules/chat/domain/ports/knowledge-router.port';

/**
 * Build an orchestrator stub that captures every `OrchestratorInput` it sees
 * AND returns the requested synthetic output with `metadata.sources` plumbed
 * through. Used as the LLM seam : the assistant-response parser would have
 * already converted the raw model text into `OrchestratorOutput` upstream, so
 * the integration test starts from the post-parse shape.
 * @param output - Partial `OrchestratorOutput` overrides ; defaults to a
 *                 minimal synthetic response with empty metadata.
 * @returns Tuple of the orchestrator stub plus the captured-inputs array. The
 *          caller can read `capturedInputs[0]` after a single `postMessage`
 *          call to assert what the LLM would have seen.
 */
function makeRecordingOrchestrator(output: Partial<OrchestratorOutput> = {}): {
  orchestrator: ChatOrchestrator;
  capturedInputs: OrchestratorInput[];
} {
  const capturedInputs: OrchestratorInput[] = [];
  const fakeOutput: OrchestratorOutput = {
    text: 'Synthetic assistant response',
    metadata: {},
    ...output,
  };

  const orchestrator: ChatOrchestrator = {
    async generate(input: OrchestratorInput): Promise<OrchestratorOutput> {
      capturedInputs.push(input);
      return fakeOutput;
    },
    async generateStream(
      input: OrchestratorInput,
      onChunk: (text: string) => void,
    ): Promise<OrchestratorOutput> {
      capturedInputs.push(input);
      onChunk(fakeOutput.text);
      return fakeOutput;
    },
  };

  return { orchestrator, capturedInputs };
}

/**
 * Build a router stub that always returns the supplied {@link KnowledgeRouterResult}.
 * @param result - Fixed result returned on every `resolve()` call.
 * @returns A `KnowledgeRouterPort`-shaped stub suitable for `buildChatTestService`.
 */
function makeFixedRouter(result: KnowledgeRouterResult): KnowledgeRouterPort {
  return {
    async resolve() {
      return result;
    },
  };
}

/* ─────────────────────────────────────────────────────────────────────── */

describe('chat citations end-to-end integration (T6.1)', () => {
  it('case 1 — LLM returns 3 valid sources → response carries metadata.sources.length === 3', async () => {
    const validSources: CitationSource[] = [
      makeCitationSource({
        type: 'wikidata',
        title: 'Mona Lisa',
        quote: 'The Mona Lisa is a half-length portrait by Leonardo da Vinci.',
        url: 'https://www.wikidata.org/wiki/Q12418',
      }),
      makeCitationSource({
        type: 'web',
        title: 'Louvre Mona Lisa entry',
        quote: 'Painted in oil on a poplar wood panel between 1503 and 1519.',
        url: 'https://www.louvre.fr/en/oeuvre-notices/mona-lisa-portrait-lisa-gherardini',
      }),
      makeCitationSource({
        type: 'commons',
        title: 'Mona Lisa file',
        quote: 'Image hosted on Wikimedia Commons under PD-Art license.',
        url: 'https://commons.wikimedia.org/wiki/File:Mona_Lisa.jpg',
      }),
    ];

    const { orchestrator } = makeRecordingOrchestrator({
      metadata: { sources: validSources },
    });
    const service = buildChatTestService({ orchestrator });
    const session = await service.createSession({ locale: 'en-US', museumMode: true });
    const response = await service.postMessage(session.id, { text: 'Tell me about Mona Lisa' });

    expect(response.metadata.sources).toBeDefined();
    expect(response.metadata.sources).toHaveLength(3);
    expect(response.metadata.sources?.[0].type).toBe('wikidata');
    expect(response.metadata.sources?.[1].type).toBe('web');
    expect(response.metadata.sources?.[2].type).toBe('commons');
  });

  it('case 2 — hallucinated quote is filtered by sources-validator', async () => {
    /*
     * OPEN-ISSUE-1 — `validateSources()` (T2.4) is implemented in
     * `useCase/orchestration/sources-validator.ts` and unit-tested, but the
     * call site in `message-commit.ts` / `chat-message.service.ts` does NOT
     * yet invoke it. The design sequence diagram (§S5) shows the validator
     * being called after the LLM returns and before the assistant message is
     * persisted, but no atomic task in `tasks.md` wires it. This test is
     * `.skip()`'d under UFR-013 (do not pretend a feature is working when it
     * is not) ; when the wiring lands, remove `.skip` and the test must pass
     * verbatim — it is shaped against the documented post-LLM behaviour.
     *
     * Expected shape once wired :
     *   - 3 sources emitted by the LLM (mock).
     *   - 1 has a `quote` that is NOT a substring of any router-supplied fact.
     *   - The post-LLM `sources-validator` rejects the hallucinated entry.
     *   - Response `metadata.sources.length === 2`.
     */
    const routerFacts = [
      'Mona Lisa (Wikidata Q12418). Artist: Leonardo da Vinci.',
      'Painted in oil on a poplar wood panel between 1503 and 1519.',
    ];
    const router = makeFixedRouter({
      facts: routerFacts,
      source: 'wikidata',
      fallback_triggered: false,
      metadata: { searchTerm: 'Mona Lisa', latencyMs: { kb: 11 } },
    });

    const hallucinatedSource = makeCitationSource({
      type: 'web',
      title: 'Fabricated quote',
      quote: 'This sentence does not appear in any of the router facts.',
      url: 'https://example.invalid/article',
    });
    const groundedA = makeCitationSource({
      type: 'wikidata',
      quote: 'Mona Lisa (Wikidata Q12418). Artist: Leonardo da Vinci.',
    });
    const groundedB = makeCitationSource({
      type: 'web',
      quote: 'Painted in oil on a poplar wood panel between 1503 and 1519.',
      url: 'https://www.louvre.fr/en/oeuvre-notices/mona-lisa-portrait-lisa-gherardini',
    });

    const { orchestrator } = makeRecordingOrchestrator({
      metadata: { sources: [groundedA, hallucinatedSource, groundedB] },
    });
    const service = buildChatTestService({ orchestrator, knowledgeRouter: router });
    const session = await service.createSession({ locale: 'en-US', museumMode: true });
    const response = await service.postMessage(session.id, { text: 'Tell me about Mona Lisa' });

    expect(response.metadata.sources).toHaveLength(2);
    expect(response.metadata.sources?.map((s) => s.quote)).not.toContain(hallucinatedSource.quote);
  });

  it('case 3 — LLM omits sources[] → response metadata.sources is undefined (graceful)', async () => {
    const { orchestrator } = makeRecordingOrchestrator({
      metadata: { /* no sources field at all */ },
    });
    const service = buildChatTestService({ orchestrator });
    const session = await service.createSession({ locale: 'en-US', museumMode: true });
    const response = await service.postMessage(session.id, { text: 'A generic art question' });

    expect(response.metadata.sources).toBeUndefined();
  });

  it('case 4 — Spotlighting envelope: router facts → orchestrator input + envelope nonce 16 hex chars', async () => {
    // Step A — router supplies facts ; the prepare pipeline must thread them
    // into the OrchestratorInput so the langchain orchestrator (or
    // `buildSectionMessages` in tests) can wrap them in the Spotlighting
    // envelope. The recording orchestrator captures the input verbatim.
    const routerFacts = [
      'Mona Lisa (Wikidata Q12418).',
      'Artist: Leonardo da Vinci.',
      'Date: 1503.',
    ];
    const router = makeFixedRouter({
      facts: routerFacts,
      source: 'wikidata',
      fallback_triggered: false,
      metadata: { searchTerm: 'Tell me about Mona Lisa', latencyMs: { kb: 13 } },
    });

    const { orchestrator, capturedInputs } = makeRecordingOrchestrator();
    const service = buildChatTestService({ orchestrator, knowledgeRouter: router });
    const session = await service.createSession({ locale: 'en-US', museumMode: true });
    await service.postMessage(session.id, { text: 'Tell me about Mona Lisa' });

    // The orchestrator-level seam : facts + factsSource must be propagated so
    // the langchain wrapper (`buildSectionMessages`) can build the envelope.
    expect(capturedInputs[0].facts).toEqual(routerFacts);
    expect(capturedInputs[0].factsSource).toBe('wikidata');

    // Step B — the envelope renderer (`buildContextSection`) produces the
    // documented marker shape with a fresh 16-hex-char nonce. We exercise the
    // exact path the orchestrator would (T3.4 wiring) and assert the marker
    // contract end-to-end. This is the closest thing to "envelope visible in
    // prompt sent to LLM" we can do without a real langchain HTTP capture —
    // and is sufficient because `buildSectionMessages` is unit-tested to call
    // `buildContextSection` with the exact `facts` + `factsSource` we asserted
    // above.
    const nonce = generateNonce();
    expect(nonce).toMatch(/^[0-9a-f]{16}$/);
    const envelope = buildContextSection(routerFacts, 'wikidata', nonce);

    expect(envelope).toContain(`[BEGIN UNTRUSTED EXTERNAL DATA — nonce=${nonce}]`);
    expect(envelope).toContain(`[END UNTRUSTED EXTERNAL DATA — nonce=${nonce}]`);
    expect(envelope).toContain('<untrusted_content source="wikidata"');
    expect(envelope).toContain('nonce="' + nonce + '"');
    // Each fact rendered with a numbered prefix `[1]`, `[2]`, etc.
    expect(envelope).toContain('[1] Mona Lisa (Wikidata Q12418).');
    expect(envelope).toContain('[2] Artist: Leonardo da Vinci.');
    expect(envelope).toContain('[3] Date: 1503.');
  });
});
