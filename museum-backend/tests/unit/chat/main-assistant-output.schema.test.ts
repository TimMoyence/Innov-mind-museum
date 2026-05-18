/**
 * C9.17 T0.2.a — pins the `sources` field added to
 * `mainAssistantOutputSchema` so Citations v2 round-trips through the
 * structured-output fast path (the sole path since the legacy plain-text +
 * JSON-tail parser was retired in Step B).
 *
 * The shared `CitationSourceSchema` (chat.types.ts) is the runtime
 * per-entry validator used by `toSources` in `assistant-response.ts`.
 * Here the LLM-emission schema is a sibling whose only divergence is
 * `.nullable()` on `confidence` (OpenAI structured-output strict mode
 * rejects `.optional()`).
 *
 * Refs:
 *   - spec.md  → .claude/skills/team/team-state/2026-05-18-w1-c9-17-sunset-meta-parser/spec.md (§6 Q1, §10 OQ-1)
 *   - tasks.md → .claude/skills/team/team-state/2026-05-18-w1-c9-17-sunset-meta-parser/tasks.md (T0.2.a, T2.2.f)
 */

import { mainAssistantOutputSchema } from '@modules/chat/useCase/llm/llm-sections/main-assistant-output.schema';

const VALID_SOURCE = {
  url: 'https://www.wikidata.org/wiki/Q12418',
  type: 'wikidata' as const,
  title: 'Mona Lisa',
  quote: 'The Mona Lisa is a half-length portrait painting by Leonardo da Vinci.',
  confidence: 0.92,
};

const VALID_SOURCE_NULL_CONFIDENCE = {
  url: 'https://commons.wikimedia.org/wiki/File:Mona_Lisa.jpg',
  type: 'commons' as const,
  title: 'Mona Lisa image',
  quote: 'Painted between 1503 and 1519 by Leonardo da Vinci.',
  confidence: null,
};

function makeBasePayload(): Record<string, unknown> {
  return {
    text: 'Mona Lisa is a portrait painted by Leonardo da Vinci between 1503 and 1519.',
    deeperContext: null,
    openQuestion: null,
    suggestedFollowUp: null,
    imageDescription: null,
    suggestedImages: null,
    detectedArtwork: null,
    recommendations: null,
    expertiseSignal: null,
    citations: null,
    sources: null,
  };
}

describe('mainAssistantOutputSchema — sources field (C9.17 T0.2.a)', () => {
  it('accepts a payload whose sources array contains valid emission entries', () => {
    const payload = {
      ...makeBasePayload(),
      sources: [VALID_SOURCE, VALID_SOURCE_NULL_CONFIDENCE],
    };

    const result = mainAssistantOutputSchema.safeParse(payload);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sources).toHaveLength(2);
      expect(result.data.sources?.[0]?.url).toBe(VALID_SOURCE.url);
      expect(result.data.sources?.[1]?.confidence).toBeNull();
    }
  });

  it('accepts a payload with sources explicitly set to null', () => {
    const payload = makeBasePayload();

    const result = mainAssistantOutputSchema.safeParse(payload);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sources).toBeNull();
    }
  });

  it('rejects a payload whose sources entry is missing a required field', () => {
    const malformed = {
      url: 'https://example.org/article',
      type: 'web' as const,
      title: 'No quote here',
      // quote intentionally omitted
      confidence: 0.5,
    };
    const payload = {
      ...makeBasePayload(),
      sources: [malformed],
    };

    const result = mainAssistantOutputSchema.safeParse(payload);

    expect(result.success).toBe(false);
  });

  it('rejects a payload whose sources entry uses a non-whitelisted type', () => {
    const payload = {
      ...makeBasePayload(),
      sources: [
        {
          url: 'https://example.org/article',
          type: 'not-a-real-type',
          title: 'Some article',
          quote: 'A quote of more than ten characters.',
          confidence: 0.5,
        },
      ],
    };

    const result = mainAssistantOutputSchema.safeParse(payload);

    expect(result.success).toBe(false);
  });
});
