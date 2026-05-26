/**
 * R6 + R7 — stripFreeText MaskFunction for Langfuse PII redaction.
 *
 * R6: golden tests on LangChain CallbackHandler body shapes (input.messages[*].
 * content, input.prompt, input.text, output.text, output.completion,
 * output.content). Replace free-text values with `'[STRIPPED]'`, preserve
 * roles / model / usage / metadata byte-identical.
 *
 * R7: fail-safe — never throws, returns input on internal error, warns once
 * via logger.warn('langfuse_mask_failed', …). Required because Langfuse
 * applies the mask synchronously inside `maskEventBodyInPlace`; a throw would
 * crash the SDK enqueue path and break the chat hot path.
 *
 * RED: file `strip-free-text.ts` does NOT exist yet → ALL tests fail with
 * module-not-found / type error at import time. GREEN: file added, tests
 * turn green byte-identical.
 */

jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { logger } from '@shared/logger/logger';
import { stripFreeText } from '@shared/observability/strip-free-text';

const STRIPPED = '[STRIPPED]';

describe('stripFreeText — R6 golden coverage (LangChain + manual shapes)', () => {
  beforeEach(() => {
    (logger.warn as jest.Mock).mockClear();
  });

  it('strips LangChain CallbackHandler input.messages[*].content + output.text', () => {
    const input = {
      data: {
        input: {
          messages: [
            { role: 'user', content: 'mon mail u@x.tld' },
            { role: 'assistant', content: 'réponse' },
          ],
        },
        output: { text: 'reply with PII +33 6 12 34 56 78' },
        metadata: { museumId: 'm1', intent: 'art', locale: 'fr' },
      },
    };

    const out = stripFreeText(input);

    // Free-text replaced
    expect(out.data.input.messages[0].content).toBe(STRIPPED);
    expect(out.data.input.messages[1].content).toBe(STRIPPED);
    expect(out.data.output.text).toBe(STRIPPED);

    // Roles preserved
    expect(out.data.input.messages[0].role).toBe('user');
    expect(out.data.input.messages[1].role).toBe('assistant');

    // Metadata byte-identical (PII-safe by construction at the source)
    expect(out.data.metadata).toEqual({ museumId: 'm1', intent: 'art', locale: 'fr' });
  });

  it('strips input.prompt string', () => {
    const out = stripFreeText({
      data: { input: { prompt: 'free text with email u@x.tld' }, output: {} },
    });
    expect(out.data.input.prompt).toBe(STRIPPED);
  });

  it('strips input.text string', () => {
    const out = stripFreeText({
      data: { input: { text: 'free text' }, output: {} },
    });
    expect(out.data.input.text).toBe(STRIPPED);
  });

  it('strips output.completion string', () => {
    const out = stripFreeText({
      data: { input: {}, output: { completion: 'free reply' } },
    });
    expect(out.data.output.completion).toBe(STRIPPED);
  });

  it('strips output.content string', () => {
    const out = stripFreeText({
      data: { input: {}, output: { content: 'free reply' } },
    });
    expect(out.data.output.content).toBe(STRIPPED);
  });

  it('preserves model / usage / metadata fields untouched', () => {
    const input = {
      data: {
        model: 'gpt-4o-mini',
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
        usageDetails: { input: 10, output: 20, total: 30 },
        input: { messages: [{ role: 'user', content: 'free' }] },
        output: { text: 'x' },
        metadata: { museumId: 'm1', intent: 'art', locale: 'fr' },
      },
    };

    const out = stripFreeText(input);

    // Model + usage preserved byte-identical
    expect(out.data.model).toBe('gpt-4o-mini');
    expect(out.data.usage).toEqual({ promptTokens: 10, completionTokens: 20, totalTokens: 30 });
    expect(out.data.usageDetails).toEqual({ input: 10, output: 20, total: 30 });
    expect(out.data.metadata).toEqual({ museumId: 'm1', intent: 'art', locale: 'fr' });
  });

  it('is idempotent — applying twice equals applying once', () => {
    const input = {
      data: {
        input: { messages: [{ role: 'user', content: 'free' }] },
        output: { text: 'reply' },
      },
    };
    const once = stripFreeText(input);
    const twice = stripFreeText(once);
    expect(twice).toEqual(once);
  });
});

describe('stripFreeText — R7 fail-safe (never throws, warns)', () => {
  beforeEach(() => {
    (logger.warn as jest.Mock).mockClear();
  });

  it('returns input unchanged when data is undefined', () => {
    const input = { data: undefined };
    let out: unknown;
    expect(() => {
      out = stripFreeText(input);
    }).not.toThrow();
    expect(out).toEqual({ data: undefined });
  });

  it('returns input unchanged when params has no data key', () => {
    let out: unknown;
    expect(() => {
      out = stripFreeText({} as unknown as { data: unknown });
    }).not.toThrow();
    // Input returned untouched (empty obj).
    expect(out).toEqual({});
  });

  it('returns input unchanged when data is a primitive string', () => {
    let out: unknown;
    expect(() => {
      out = stripFreeText({ data: 'string' as unknown });
    }).not.toThrow();
    expect(out).toEqual({ data: 'string' });
  });

  it('never throws on Symbol data', () => {
    expect(() => stripFreeText({ data: Symbol('weird') as unknown })).not.toThrow();
  });

  it('catches internal exception, warns "langfuse_mask_failed", returns input', () => {
    // A proxy that throws when input/output property is read forces the
    // internal traversal to throw (regardless of impl details — covers
    // any reasonable shape access pattern).
    const trap: unknown = new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === 'input' || prop === 'output' || prop === 'messages') {
            throw new Error('proxy boom');
          }
          return undefined;
        },
      },
    );

    let out: unknown;
    expect(() => {
      out = stripFreeText({ data: trap });
    }).not.toThrow();

    // The exact return is "input unchanged" (R7) — for a throwing proxy, that
    // means the params reference itself.
    expect(out).toBeDefined();

    // Logger warn fired with the expected event tag.
    expect(logger.warn).toHaveBeenCalledTimes(1);
    const [event] = (logger.warn as jest.Mock).mock.calls[0] as [string, unknown];
    expect(event).toMatch(/langfuse_mask_failed/);
  });

  it('warn payload does NOT include the data (no PII echo in logs)', () => {
    const secretEmail = 'must-not-leak@x.tld';
    const trap: unknown = new Proxy(
      { email: secretEmail },
      {
        get() {
          throw new Error('proxy boom');
        },
      },
    );

    stripFreeText({ data: trap });

    expect(logger.warn).toHaveBeenCalledTimes(1);
    const [, payload] = (logger.warn as jest.Mock).mock.calls[0] as [string, unknown];
    // Stringify the warn payload — it must not include the secret email.
    expect(JSON.stringify(payload ?? {})).not.toContain(secretEmail);
  });
});

/**
 * Cycle 2 (RUN 2026-05-26-chat-pipeline-hardening) — multimodal content support.
 *
 * Defect (A-03 HIGH + A-05 LOW-MED, spec-cycle2.md REQ-1..10) : the mask only
 * strips `content` when `typeof content === 'string'` (strip-free-text.ts:51-62,
 * `stripMessagesArray`). For the core product shape — "photograph an artwork
 * then chat" — the HumanMessage content is an ARRAY
 * `[{type:'text', text}, {type:'image_url', image_url:{url:'data:...base64'}}]`
 * (producer verified llm-prompt-builder.ts:266-269). The array branch is never
 * touched → the user text (content[0].text, A-03) AND the base64 data-URL
 * (content[1].image_url.url, A-05) leak in clear to Langfuse.
 *
 * These cases prove the leak in RED (T-06/T-07/T-10/T-11/T-15/T-16/T-17/T-18/T-19
 * fail today). String-only cases (T-13/T-14) are non-regression locks.
 *
 * Lib-docs consulted (UFR-022) :
 *   - lib-docs/langfuse/PATTERNS.md §2.1 (mask: ({data}) => …) — the mask is a
 *     ctor hook of signature (params:{data:any}) => any (NFR-03, conforms to
 *     langfuse-core@3.38.20 lib/index.d.ts:7126-7128). These fixtures feed the
 *     real `{ data }` shape the SDK passes.
 *   - lib-docs/langfuse/PATTERNS.md §2.8 — CallbackHandler auto-captures
 *     input.messages[*] (content array) + output via handleChatModelStart /
 *     handleLLMEnd → these are the body shapes asserted below.
 *   - lib-docs/langfuse/PATTERNS.md §3 DO #13 — one central mask hook (the fix
 *     belongs in stripFreeText, not at the producer call-site).
 *   - lib-docs/langfuse/LESSONS.md LF-V3-05 — the mask replaces free-text with
 *     '[STRIPPED]' while preserving metadata/model/usage/usageDetails (REQ-9).
 */
describe('stripFreeText — Cycle 2 multimodal content (A-03 + A-05)', () => {
  beforeEach(() => {
    (logger.warn as jest.Mock).mockClear();
  });

  // T-06 — A-03 + A-05 real product shape: text + image data-URL.
  it('strips text part AND image_url.url in a multimodal input message (T-06)', () => {
    const input = {
      data: {
        input: {
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: '<user_message>mon mail u@x.tld</user_message>' },
                { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,QUJD' } },
              ],
            },
          ],
        },
      },
    };

    const out = stripFreeText(input);
    const parts = out.data.input.messages[0].content;

    // A-03 : user text must be redacted.
    expect(parts[0].text).toBe(STRIPPED);
    expect(parts[0].type).toBe('text');
    // A-05 : image data-URL must be redacted, structure preserved.
    expect(parts[1].image_url.url).toBe(STRIPPED);
    expect(parts[1].type).toBe('image_url');
    // Role preserved (REQ-9).
    expect(out.data.input.messages[0].role).toBe('user');
    // No clear-text leak anywhere in the serialised output.
    const serialised = JSON.stringify(out);
    expect(serialised).not.toContain('u@x.tld');
    expect(serialised).not.toContain('base64,QUJD');
  });

  // T-07 — multiple text parts all stripped.
  it('strips every text part when content has multiple text parts (T-07)', () => {
    const input = {
      data: {
        input: {
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: 'first secret a' },
                { type: 'text', text: 'second secret b' },
              ],
            },
          ],
        },
      },
    };

    const out = stripFreeText(input);
    const parts = out.data.input.messages[0].content;
    expect(parts[0].text).toBe(STRIPPED);
    expect(parts[1].text).toBe(STRIPPED);
  });

  // T-08 — part of type 'text' WITHOUT a text field: unchanged, no crash (REQ-6).
  it('leaves a text part without a text field unchanged and does not crash (T-08)', () => {
    const input = {
      data: { input: { messages: [{ role: 'user', content: [{ type: 'text' }] }] } },
    };

    let out: typeof input | undefined;
    expect(() => {
      out = stripFreeText(input);
    }).not.toThrow();
    const part = out!.data.input.messages[0].content[0] as { type: string; text?: unknown };
    expect(part.type).toBe('text');
    expect(part.text).toBeUndefined();
  });

  // T-09 — empty text string: nothing to leak → frozen contract = leave '' as-is (REQ-6).
  it('leaves an empty text part as empty string (nothing to leak) (T-09)', () => {
    const input = {
      data: { input: { messages: [{ role: 'user', content: [{ type: 'text', text: '' }] }] } },
    };

    const out = stripFreeText(input);
    expect(out.data.input.messages[0].content[0].text).toBe('');
  });

  // T-10 — image-only part with an http(s) signed URL (REQ-2).
  it('strips image_url.url for an image-only part with an http URL (T-10)', () => {
    const input = {
      data: {
        input: {
          messages: [
            {
              role: 'user',
              content: [
                { type: 'image_url', image_url: { url: 'https://s3.example/img.jpg?X-Amz=sig' } },
              ],
            },
          ],
        },
      },
    };

    const out = stripFreeText(input);
    expect(out.data.input.messages[0].content[0].image_url.url).toBe(STRIPPED);
    expect(JSON.stringify(out)).not.toContain('X-Amz=sig');
  });

  // T-11 — image_url as a bare string (LangChain serialisation variant, R-3 robustness).
  it('strips a bare-string image_url part (T-11)', () => {
    const input = {
      data: {
        input: {
          messages: [
            {
              role: 'user',
              content: [{ type: 'image_url', image_url: 'data:image/png;base64,QQ==' }],
            },
          ],
        },
      },
    };

    const out = stripFreeText(input);
    expect(out.data.input.messages[0].content[0].image_url).toBe(STRIPPED);
    expect(JSON.stringify(out)).not.toContain('base64,QQ==');
  });

  // T-12 — unknown part type: left unchanged (REQ-7, accepted residue).
  it('leaves an unknown part type unchanged (T-12)', () => {
    const input = {
      data: { input: { messages: [{ role: 'user', content: [{ type: 'foo', bar: 'x' }] }] } },
    };

    const out = stripFreeText(input);
    expect(out.data.input.messages[0].content[0]).toEqual({ type: 'foo', bar: 'x' });
  });

  // T-13 — empty content array: left as-is (REQ-5).
  it('leaves an empty content array unchanged (T-13)', () => {
    const input = {
      data: { input: { messages: [{ role: 'user', content: [] }] } },
    };

    const out = stripFreeText(input);
    expect(out.data.input.messages[0].content).toEqual([]);
  });

  // T-14 — content null / absent: message unchanged, no crash (REQ-5).
  it('leaves a message with null/absent content unchanged and does not crash (T-14)', () => {
    const input = {
      data: {
        input: {
          messages: [{ role: 'user', content: null }, { role: 'assistant' }],
        },
      },
    };

    let out: typeof input | undefined;
    expect(() => {
      out = stripFreeText(input);
    }).not.toThrow();
    expect(out!.data.input.messages[0].content).toBeNull();
    expect(out!.data.input.messages[1]).toEqual({ role: 'assistant' });
  });

  // T-15 — A-03 + A-05 on the OUTPUT array (symmetry, REQ-4).
  it('strips text + image_url in a multimodal output.content array (T-15)', () => {
    const input = {
      data: {
        input: {},
        output: {
          content: [
            { type: 'text', text: 'reply secret with mail u@x.tld' },
            { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,ZZZZ' } },
          ],
        },
      },
    };

    const out = stripFreeText(input);
    expect(out.data.output.content[0].text).toBe(STRIPPED);
    expect(out.data.output.content[1].image_url.url).toBe(STRIPPED);
    const serialised = JSON.stringify(out);
    expect(serialised).not.toContain('u@x.tld');
    expect(serialised).not.toContain('base64,ZZZZ');
  });

  // T-16 — idempotence on the multimodal shape (REQ-8).
  it('is idempotent on a multimodal body (T-16)', () => {
    const input = {
      data: {
        input: {
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: 'secret' },
                { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,QUJD' } },
              ],
            },
          ],
        },
      },
    };

    const once = stripFreeText(input);
    const twice = stripFreeText(once);
    expect(twice).toEqual(once);
  });

  // T-17 — preservation of usage/model/metadata across a multimodal mask (REQ-9).
  it('preserves model/usage/usageDetails/metadata byte-identical on a multimodal body (T-17)', () => {
    const input = {
      data: {
        model: 'gpt-4o-mini',
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
        usageDetails: { input: 10, output: 20, total: 30 },
        input: {
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: 'secret' },
                { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,QUJD' } },
              ],
            },
          ],
        },
        metadata: { museumId: 'm1', intent: 'art', locale: 'fr' },
      },
    };

    const out = stripFreeText(input);
    expect(out.data.model).toBe('gpt-4o-mini');
    expect(out.data.usage).toEqual({ promptTokens: 10, completionTokens: 20, totalTokens: 30 });
    expect(out.data.usageDetails).toEqual({ input: 10, output: 20, total: 30 });
    expect(out.data.metadata).toEqual({ museumId: 'm1', intent: 'art', locale: 'fr' });
    // The free-text inside the array is still stripped.
    expect(out.data.input.messages[0].content[0].text).toBe(STRIPPED);
  });

  // T-18 — hostile array (Proxy throwing on traversal): input unchanged + 1 warn, no PII (REQ-10).
  it('fail-safe on a hostile array content: returns input + warns once without PII (T-18)', () => {
    const secret = 'array-secret@x.tld';
    const hostileArray = new Proxy([] as unknown[], {
      get(_t, prop) {
        if (prop === Symbol.iterator || prop === 'length' || prop === 'map' || prop === '0') {
          throw new Error('hostile array boom');
        }
        return undefined;
      },
    });
    const input = {
      data: { secret, input: { messages: [{ role: 'user', content: hostileArray }] } },
    };

    let out: unknown;
    expect(() => {
      out = stripFreeText(input);
    }).not.toThrow();
    expect(out).toBeDefined();

    expect(logger.warn).toHaveBeenCalledTimes(1);
    const [event, payload] = (logger.warn as jest.Mock).mock.calls[0] as [string, unknown];
    expect(event).toMatch(/langfuse_mask_failed/);
    // No PII echo in the warn payload.
    expect(JSON.stringify(payload ?? {})).not.toContain(secret);
  });

  // T-19 — top-level `messages` (not under input) with a multimodal array (REQ-1,2).
  it('strips a multimodal array in top-level data.messages (T-19)', () => {
    const input = {
      data: {
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'top-level secret u@x.tld' },
              { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,TTTT' } },
            ],
          },
        ],
      },
    };

    const out = stripFreeText(input);
    expect(out.data.messages[0].content[0].text).toBe(STRIPPED);
    expect(out.data.messages[0].content[1].image_url.url).toBe(STRIPPED);
    const serialised = JSON.stringify(out);
    expect(serialised).not.toContain('u@x.tld');
    expect(serialised).not.toContain('base64,TTTT');
  });
});
