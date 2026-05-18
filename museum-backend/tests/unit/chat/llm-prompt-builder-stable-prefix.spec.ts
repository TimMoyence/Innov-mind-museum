/**
 * C9.5 — TDD red lock for stable-prefix message ordering.
 *
 * Asserts the byte-identity invariant of `buildSectionMessages` between two
 * simulated turns of the same chat session. The OpenAI prompt-cache keys on a
 * byte-identical PREFIX shared across calls — see
 * `.claude/skills/team/team-state/2026-05-18-w1-c9-5-stable-prefix-cache/spec.md`
 * §3 R1..R4 + design.md §3 (before/after ordering diagram).
 *
 * Expected RED state today (4bf040b7 HEAD, before T2.1 reorder):
 *
 *   - Test 1 (stable prefix)          FAIL — envelope at messages[1] breaks byte-identity.
 *   - Test 2 (no var block in prefix) FAIL — envelope leaks into messages[1].
 *   - Test 3 (boundary marker)        PASS — already correct on messages[0] tail.
 *   - Test 4 (envelope post-reorder)  FAIL — envelope sits at index 1 today, target is ≥2.
 *   - Test 5 (trailing reminder)      PASS — already correct (C9.11 sandwich).
 *
 * Once T2.1 reorders `buildSectionMessages` so `[SystemMessage(system),
 * SystemMessage(section)]` is the unconditional 2-message prefix, all 5 tests
 * flip green.
 */
import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';

import {
  buildSectionMessages,
  toContentString,
  type ChatModelMessage,
} from '@modules/chat/useCase/llm/llm-prompt-builder';

const SYSTEM_PROMPT_WITH_BOUNDARY =
  'You are Musaium. Stay focused on art. [END OF SYSTEM INSTRUCTIONS]';
const SECTION_PROMPT = '[SECTION:summary] Reply in English. Be concise.';

const TRAILING_REMINDER_PREFIX = 'Remember: You are Musaium';

/**
 * Two payloads that are intentionally maximally different on every per-turn
 * variable surface. If `buildSectionMessages` puts ANY of these into the first
 * two messages, R1 byte-identity fails.
 */
const PAYLOAD_A = {
  history: [] as ChatModelMessage[],
  user: new HumanMessage('Who painted the Mona Lisa?'),
  options: {
    facts: [] as readonly string[],
    source: 'none' as const,
  },
};

const PAYLOAD_B = {
  history: [
    new HumanMessage('First turn user message.'),
    new AIMessage('First turn assistant reply.'),
    new HumanMessage('Second turn user message — much longer with details.'),
    new AIMessage('Second turn assistant reply.'),
  ] as ChatModelMessage[],
  user: new HumanMessage('A completely different second-turn question.'),
  options: {
    facts: ['Fact 1 — Picasso 1881.', 'Fact 2 — Guernica 1937.'] as readonly string[],
    source: 'wikidata' as const,
    userMemoryBlock: 'User memory: visitor previously asked about Cubism.',
    knowledgeBaseBlock: 'KB block contents for second turn.',
    webSearchBlock: 'Web search block contents for second turn.',
    localKnowledgeBlock: 'Local KB block contents for second turn.',
  },
};

describe('buildSectionMessages — stable prefix for OpenAI prompt caching (C9.5)', () => {
  it('R1 — first 2 messages BYTE-IDENTICAL between two turns of the same session', () => {
    const a = buildSectionMessages(
      SYSTEM_PROMPT_WITH_BOUNDARY,
      SECTION_PROMPT,
      PAYLOAD_A.history,
      PAYLOAD_A.user,
      PAYLOAD_A.options,
    );
    const b = buildSectionMessages(
      SYSTEM_PROMPT_WITH_BOUNDARY,
      SECTION_PROMPT,
      PAYLOAD_B.history,
      PAYLOAD_B.user,
      PAYLOAD_B.options,
    );

    const a0 = toContentString(a[0].content);
    const a1 = toContentString(a[1].content);
    const b0 = toContentString(b[0].content);
    const b1 = toContentString(b[1].content);

    // Strict string identity.
    expect(a0).toBe(b0);
    expect(a1).toBe(b1);

    // Byte-length identity (catches trailing-whitespace drift the === check
    // would catch anyway, but with a more legible failure mode).
    expect(Buffer.byteLength(a0, 'utf8')).toBe(Buffer.byteLength(b0, 'utf8'));
    expect(Buffer.byteLength(a1, 'utf8')).toBe(Buffer.byteLength(b1, 'utf8'));
  });

  it('R1.b — no variable block leaks into the cacheable prefix [0..1]', () => {
    const messages = buildSectionMessages(
      SYSTEM_PROMPT_WITH_BOUNDARY,
      SECTION_PROMPT,
      [],
      new HumanMessage('User question'),
      {
        facts: ['A grounded fact.'],
        source: 'wikidata',
        userMemoryBlock: 'memory-block-contents',
        knowledgeBaseBlock: 'kb-block-contents',
        webSearchBlock: 'web-block-contents',
        localKnowledgeBlock: 'local-kb-block-contents',
      },
    );

    expect(messages[0]).toBeInstanceOf(SystemMessage);
    expect(messages[1]).toBeInstanceOf(SystemMessage);

    const m0 = toContentString(messages[0].content);
    const m1 = toContentString(messages[1].content);

    // messages[0] = system prompt verbatim (boundary marker preserved).
    expect(m0).toBe(SYSTEM_PROMPT_WITH_BOUNDARY);
    // messages[1] = section prompt verbatim — NO per-turn block leak.
    expect(m1).toBe(SECTION_PROMPT);

    // None of the variable blocks should surface in messages[0] or [1].
    for (const variableMarker of [
      '[BEGIN UNTRUSTED EXTERNAL DATA',
      'memory-block-contents',
      'kb-block-contents',
      'web-block-contents',
      'local-kb-block-contents',
    ]) {
      expect(m0).not.toContain(variableMarker);
      expect(m1).not.toContain(variableMarker);
    }
  });

  it('R3 — [END OF SYSTEM INSTRUCTIONS] boundary marker stays on messages[0] tail', () => {
    const messages = buildSectionMessages(
      SYSTEM_PROMPT_WITH_BOUNDARY,
      SECTION_PROMPT,
      [],
      new HumanMessage('User question'),
      {
        facts: ['A fact.'],
        source: 'wikidata',
      },
    );

    const m0 = toContentString(messages[0].content);
    const m1 = toContentString(messages[1].content);

    expect(m0).toContain('[END OF SYSTEM INSTRUCTIONS]');
    expect(m1).not.toContain('[END OF SYSTEM INSTRUCTIONS]');
  });

  it('R2 — spotlighting envelope sits AT INDEX ≥ 2 (after section prompt), never at index 1', () => {
    const messages = buildSectionMessages(
      SYSTEM_PROMPT_WITH_BOUNDARY,
      SECTION_PROMPT,
      [],
      new HumanMessage('User question'),
      {
        facts: ['Fact A.', 'Fact B.'],
        source: 'wikidata',
      },
    );

    // Index 1 MUST be the section prompt — NOT the envelope.
    expect(messages[1]).toBeInstanceOf(SystemMessage);
    const m1 = toContentString(messages[1].content);
    expect(m1).toBe(SECTION_PROMPT);
    expect(m1).not.toContain('[BEGIN UNTRUSTED EXTERNAL DATA');

    // Envelope MUST land at index 2 or later.
    let envelopeIdx = -1;
    for (let i = 0; i < messages.length; i++) {
      const content = toContentString(messages[i].content);
      if (content.includes('[BEGIN UNTRUSTED EXTERNAL DATA')) {
        envelopeIdx = i;
        break;
      }
    }
    expect(envelopeIdx).toBeGreaterThanOrEqual(2);
  });

  it('R4 — last message is the canonical trailing anti-injection reminder', () => {
    // Exercise multiple optional-block combinations — last message must
    // always be the trailing reminder (C9.11 sandwich defense).
    const scenarios = [
      undefined,
      { facts: ['A.'], source: 'wikidata' as const },
      {
        facts: [] as readonly string[],
        source: 'none' as const,
        userMemoryBlock: 'mem',
        knowledgeBaseBlock: 'kb',
      },
      {
        facts: ['F.'] as readonly string[],
        source: 'web' as const,
        userMemoryBlock: 'mem',
        knowledgeBaseBlock: 'kb',
        webSearchBlock: 'web',
        localKnowledgeBlock: 'lk',
      },
    ];

    for (const opts of scenarios) {
      const messages = buildSectionMessages(
        SYSTEM_PROMPT_WITH_BOUNDARY,
        SECTION_PROMPT,
        [],
        new HumanMessage('Q.'),
        opts,
      );
      const last = messages[messages.length - 1];
      expect(last).toBeInstanceOf(SystemMessage);
      const lastContent = toContentString(last.content);
      expect(lastContent.startsWith(TRAILING_REMINDER_PREFIX)).toBe(true);
    }
  });
});
