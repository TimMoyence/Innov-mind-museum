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
