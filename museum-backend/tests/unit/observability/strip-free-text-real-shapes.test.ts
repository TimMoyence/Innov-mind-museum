/**
 * SEC-001 (HIGH — real PII egress to Langfuse) — stripFreeText against the
 * REAL `{ data }` shapes the SDK passes the mask hook.
 *
 * DEFECT (verified against installed library source, UFR-013) :
 *   `langfuse-core@3.38.20` `maskEventBodyInPlace`
 *   (`node_modules/.pnpm/langfuse-core@3.38.20/.../lib/index.cjs.js:1301-1318`)
 *   calls `mask({ data: body[key] })` SEPARATELY for each of `["input","output"]`.
 *   The mask therefore NEVER receives the WRAPPER form
 *   `{ data: { input:{messages}, output:{text} } }` that the Cycle 2 golden
 *   tests + the integration seed test assert against — it receives :
 *     (a) `{ data: [ {content, role}, ... ] }`   ← body.input  (raw extracted array)
 *     (b) `{ data: { content, role } }`          ← body.output (AIMessage object)
 *     (c) `{ data: 'raw completion text' }`       ← body.output (string fallback)
 *   (langfuse-langchain@3.38.20 lib/index.cjs.js:273, 284, 425, 430, 460-503.)
 *
 *   `stripFreeText` today :
 *     - (c) STRING → early-return (`typeof data !== 'object'`) → NOT stripped → LEAK.
 *     - (a) ARRAY  → `{ ...dataObj }` clones it as an object, looks for
 *       `.input/.output/.messages` (absent) → content never touched → LEAK.
 *     - (b) `{content,role}` → looks for `.input/.output/.messages` (absent) →
 *       content never touched → LEAK.
 *
 * These cases MUST FAIL in RED (the user prompt / conversation / image data-URL
 * leak in clear to Langfuse). The GREEN cycle handles the real top-level forms
 * (string → [STRIPPED]; array → strip each message content; {content,role} →
 * strip .content) while KEEPING the wrapper branches as defence-in-depth.
 *
 * The pre-existing wrapper-shape cases (strip-free-text.test.ts,
 * langfuse-pii-seed.test.ts) are NOT modified — they remain the
 * defence-in-depth lock and must stay green through GREEN.
 *
 * lib-docs consulted (UFR-022) :
 *   - lib-docs/langfuse/PATTERNS.md §2.1 (mask: ({data}) => …, signature
 *     (params:{data:any}) => any conforms langfuse-core@3.38.20).
 *   - lib-docs/langfuse/PATTERNS.md §2.8 + §8.1 — CallbackHandler.handleLLMEnd /
 *     handleChatModelStart auto-capture input(.messages array)/output → the
 *     body shapes asserted below.
 *   - lib-docs/langfuse/PATTERNS.md §3 DO #13 — one central mask hook; the fix
 *     belongs in stripFreeText, not the producer.
 *   - lib-docs/langfuse/LESSONS.md LF-V3-05 — mask replaces free-text with
 *     '[STRIPPED]', preserves metadata/model/usage; LF-V3-09 — CallbackHandler
 *     is the PII auto-capture vector re-opened post-TD-LF-02.
 */

jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { logger } from '@shared/logger/logger';
import { stripFreeText } from '@shared/observability/strip-free-text';
import {
  makeInputArrayPayload,
  makeMultimodalUserMessage,
  makeOutputObjectPayload,
  makeOutputStringPayload,
} from '../../helpers/observability/maskPayloads';

const STRIPPED = '[STRIPPED]';

describe('stripFreeText — SEC-001 real SDK mask shapes (per-key, top-level)', () => {
  beforeEach(() => {
    (logger.warn as jest.Mock).mockClear();
  });

  // (a) input array — text-only user message. Form: { data: [ {content, role} ] }.
  it('strips the content of a string-content message in a top-level input ARRAY (a)', () => {
    const payload = makeInputArrayPayload([
      { role: 'user', content: 'mon secret u@x.tld' },
      { role: 'assistant', content: 'réponse précédente' },
    ]);

    const out = stripFreeText(payload) as { data: Array<{ content: unknown; role: string }> };

    expect(out.data[0].content).toBe(STRIPPED);
    expect(out.data[1].content).toBe(STRIPPED);
    // Roles preserved.
    expect(out.data[0].role).toBe('user');
    expect(out.data[1].role).toBe('assistant');
    // No clear-text leak anywhere.
    const serialised = JSON.stringify(out);
    expect(serialised).not.toContain('mon secret');
    expect(serialised).not.toContain('u@x.tld');
  });

  // (a) input array — multimodal user message (the core product shape).
  it('strips text part AND image data-URL in a multimodal message inside a top-level input ARRAY (a)', () => {
    const payload = makeInputArrayPayload([
      makeMultimodalUserMessage('mon secret u@x.tld', 'data:image/jpeg;base64,QUJD'),
    ]);

    const out = stripFreeText(payload) as {
      data: Array<{ content: Array<Record<string, unknown>>; role: string }>;
    };
    const parts = out.data[0].content;

    // A-03 : user text redacted.
    expect((parts[0] as { type: string; text: unknown }).text).toBe(STRIPPED);
    expect((parts[0] as { type: string }).type).toBe('text');
    // A-05 : image data-URL redacted, structure preserved.
    expect((parts[1] as { image_url: { url: unknown } }).image_url.url).toBe(STRIPPED);
    expect((parts[1] as { type: string }).type).toBe('image_url');
    // Role preserved.
    expect(out.data[0].role).toBe('user');

    const serialised = JSON.stringify(out);
    expect(serialised).not.toContain('u@x.tld');
    expect(serialised).not.toContain('base64,QUJD');
  });

  // (b) output object — AIMessage { content, role }.
  it('strips .content of a top-level output OBJECT { content, role } (b)', () => {
    const payload = makeOutputObjectPayload('assistant secret reply with u@x.tld');

    const out = stripFreeText(payload) as { data: { content: unknown; role: string } };

    expect(out.data.content).toBe(STRIPPED);
    // Role preserved.
    expect(out.data.role).toBe('assistant');
    const serialised = JSON.stringify(out);
    expect(serialised).not.toContain('assistant secret');
    expect(serialised).not.toContain('u@x.tld');
  });

  // (b) output object — multimodal content array on the output side.
  it('strips multimodal content of a top-level output OBJECT { content:[...], role } (b)', () => {
    const payload = makeOutputObjectPayload(
      [
        { type: 'text', text: 'reply secret with mail u@x.tld' },
        { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,ZZZZ' } },
      ],
      'assistant',
    );

    const out = stripFreeText(payload) as {
      data: { content: Array<Record<string, unknown>>; role: string };
    };
    const parts = out.data.content;

    expect((parts[0] as { text: unknown }).text).toBe(STRIPPED);
    expect((parts[1] as { image_url: { url: unknown } }).image_url.url).toBe(STRIPPED);
    const serialised = JSON.stringify(out);
    expect(serialised).not.toContain('u@x.tld');
    expect(serialised).not.toContain('base64,ZZZZ');
  });

  // (c) output string fallback — raw completion text.
  it('strips a top-level output STRING fallback (c)', () => {
    const payload = makeOutputStringPayload('completion secret with u@x.tld');

    const out = stripFreeText(payload) as { data: unknown };

    expect(out.data).toBe(STRIPPED);
    expect(JSON.stringify(out)).not.toContain('u@x.tld');
    expect(JSON.stringify(out)).not.toContain('completion secret');
  });

  // Idempotence on the real array form (apply twice == once).
  it('is idempotent on a top-level input ARRAY (a)', () => {
    const payload = makeInputArrayPayload([
      makeMultimodalUserMessage('secret', 'data:image/jpeg;base64,QUJD'),
    ]);

    const once = stripFreeText(payload);
    const twice = stripFreeText(once);
    expect(twice).toEqual(once);
  });

  // A NON-empty plain string must always be stripped — guards the (c) leak in
  // the most reduced form (the early-return today returns it untouched).
  it('strips a bare top-level data STRING (reduced form of (c))', () => {
    const out = stripFreeText({ data: 'bare secret u@x.tld' }) as { data: unknown };
    expect(out.data).toBe(STRIPPED);
  });
});
