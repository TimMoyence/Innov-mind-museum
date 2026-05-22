/**
 * R8 — Langfuse PII seed invariant test.
 *
 * Constructs a representative event body (LangChain CallbackHandler shape with
 * input.messages + output.text containing seeded email + phone PII), applies
 * `stripFreeText` (the mask wired on the Langfuse ctor by R5), and asserts
 * that the seeded PII strings do NOT appear in the final serialised payload.
 *
 * Cross-app contract: this is the global invariant that closes Vecteur 2
 * (Langfuse free-text). If R5+R6 land but this test fails, the mask is wired
 * but its shape coverage is incomplete.
 *
 * Tier signature note: this integration test does NOT need a Postgres
 * testcontainer — the invariant is purely about the mask function's effect on
 * a serialised payload. It lives in tests/integration/observability/ per
 * design.md §6 (test plan). Sentinel baseline exemption may be required
 * (declared in editor deviations); the test ITSELF is the network boundary
 * (Langfuse SDK transport).
 *
 * RED: `stripFreeText` doesn't exist → module-not-found at import time.
 * GREEN: file present, the seeded PII gets replaced by '[STRIPPED]'.
 */

jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { stripFreeText } from '@shared/observability/strip-free-text';

const SEED_EMAIL = 'seed-pii@musaium.test';
const SEED_PHONE = '+33 6 12 34 56 78';
const STRIPPED = '[STRIPPED]';

describe('Langfuse PII seed — R8 mask invariant', () => {
  it('mask strips seeded email/phone from input.messages[*].content + output.text', () => {
    const body = {
      data: {
        input: {
          messages: [
            {
              role: 'user',
              content: `mon email ${SEED_EMAIL} et tel ${SEED_PHONE}`,
            },
          ],
        },
        output: {
          text: `reply mentioning ${SEED_EMAIL}`,
        },
        metadata: {
          museumId: 'm-test',
          intent: 'art',
          locale: 'fr',
        },
      },
    };

    const masked = stripFreeText(body);
    const serialized = JSON.stringify(masked);

    // PII strings MUST NOT appear in the masked payload.
    expect(serialized).not.toContain(SEED_EMAIL);
    expect(serialized).not.toContain(SEED_PHONE);

    // STRIPPED marker MUST appear (at least 2 occurrences: input + output).
    const strippedCount = (serialized.match(/\[STRIPPED\]/g) ?? []).length;
    expect(strippedCount).toBeGreaterThanOrEqual(2);
  });

  it('preserves metadata byte-identical (PII-safe by construction)', () => {
    const metadata = {
      museumId: 'm-test',
      intent: 'art',
      locale: 'fr',
      requestId: 'rq-seed',
    };
    const body = {
      data: {
        input: { messages: [{ role: 'user', content: `${SEED_EMAIL}` }] },
        output: { text: 'reply' },
        metadata,
      },
    };

    const masked = stripFreeText(body);
    expect(masked.data.metadata).toEqual(metadata);
  });

  it('strips PII in plain input.prompt / input.text / output.completion shapes too', () => {
    const promptBody = {
      data: {
        input: { prompt: `please email me at ${SEED_EMAIL}` },
        output: { completion: `here is your code, also call ${SEED_PHONE}` },
      },
    };

    const masked = stripFreeText(promptBody);
    const serialized = JSON.stringify(masked);
    expect(serialized).not.toContain(SEED_EMAIL);
    expect(serialized).not.toContain(SEED_PHONE);
    expect(masked.data.input.prompt).toBe(STRIPPED);
    expect(masked.data.output.completion).toBe(STRIPPED);
  });
});
