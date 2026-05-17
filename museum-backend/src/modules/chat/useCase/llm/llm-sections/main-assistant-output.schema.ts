import { z } from 'zod';

/**
 * Structured-output schema for the default `summary` section of the chat
 * orchestrator. This replaces the legacy `text + [META] {json}` markup that
 * gpt-4o-mini sometimes silently drops on the first turn (notably on visual
 * subjects where `suggestedImages` got lost — promptfoo C2-enrichment 2/4
 * regressions, 2026-05).
 *
 * Mirrors {@link extractMetadata} in
 * `museum-backend/src/modules/chat/useCase/orchestration/assistant-response.ts`
 * — every field here MUST stay in sync with the runtime extractor so the
 * structured-output fast path and the legacy `[META]` fallback path produce
 * compatible {@link ChatAssistantMetadata} payloads.
 *
 * OpenAI structured-output constraints (verified against the runtime error
 * `"Zod field … uses .optional() without .nullable() which is not supported by
 * the API"`):
 * - Every property in `additionalProperties: false` objects MUST be in
 *   `required: [...]` — i.e. all fields appear in the output.
 * - Optional semantics are expressed as `.nullable()` (the model emits `null`
 *   when it has nothing to say), NOT `.optional()` alone.
 * - `.default(...)` is rejected at the schema level — coalesce on the
 *   consumer side (`?? []`, `?? undefined`).
 * - Free-form-key shapes (`record`, `dictionary`) are unsupported. We pin
 *   every key explicitly.
 *
 * `.describe()` strings are propagated by LangChain into the JSON-Schema
 * `description`, which OpenAI uses as the field's intent hint. Keep them
 * short and behavioural — they nudge the model, they don't define syntax.
 *
 * Multi-provider support — supported by the LangChain
 * {@link import('@langchain/openai').ChatOpenAI} (`response_format=json_schema`,
 * gpt-4o family ≥ 2024-08) and {@link import('@langchain/google-genai').ChatGoogleGenerativeAI}
 * (Gemini structured output) `withStructuredOutput`. Deepseek (OpenAI-compatible)
 * exposes JSON mode through the same adapter; the orchestrator gracefully
 * falls back to the legacy `[META]` parser if the model omits
 * `withStructuredOutput` (test fakes, providers without support).
 */

const detectedArtworkSchema = z
  .object({
    artworkId: z.string().nullable(),
    title: z.string().nullable(),
    artist: z.string().nullable(),
    confidence: z.number().nullable(),
    source: z.string().nullable(),
    museum: z.string().nullable(),
    room: z.string().nullable(),
  })
  .nullable();

const suggestedImageSchema = z.object({
  query: z
    .string()
    .describe(
      'Short search query that would surface an illustrative photo of the subject (e.g. "Mona Lisa Louvre", "Monet Water Lilies series").',
    ),
  description: z
    .string()
    .describe('One short sentence describing what the matching photo would show.'),
  rationale: z
    .string()
    .describe(
      'One short sentence explaining why this image illustrates the answer (e.g. "Shows the brushwork discussed above"). MUST NOT include any visitor PII (name, email, location).',
    ),
  caption: z.string().describe('≤8-word title used as the carousel thumbnail caption.'),
});

export const mainAssistantOutputSchema = z.object({
  text: z
    .string()
    .min(1)
    .describe(
      'The full natural-language reply to the visitor. Plain prose only — no markdown headers, no JSON, no [META] block. The visitor sees this verbatim.',
    ),
  deeperContext: z
    .string()
    .nullable()
    .describe(
      '2-3 sentence add-on with technical, historical or interpretive context. Set to null when the answer already covers it.',
    ),
  openQuestion: z
    .string()
    .nullable()
    .describe(
      'Open question encouraging the visitor to look more closely at the artwork. Set to null when not relevant.',
    ),
  suggestedFollowUp: z
    .string()
    .max(80)
    .nullable()
    .describe(
      'ONE short follow-up question (≤80 chars) anchored to a SPECIFIC FACT mentioned in your answer (a name, date, place, technique). NEVER a generic "Tell me more". Set to null if your answer has no concrete fact to anchor on, or is a refusal/clarification. Singular field — NEVER an array. (B3.)',
    ),
  imageDescription: z
    .string()
    .nullable()
    .describe(
      'When the visitor shared a photograph, the visual description used as evidence (foreground/background, composition, iconography). Set to null when no image was sent.',
    ),
  suggestedImages: z
    .array(suggestedImageSchema)
    .nullable()
    .describe(
      'When the topic is visual (a painting, sculpture, place, person, monument), 1-4 entries fanning out to image sources. Use 2-4 entries when the answer compares or covers multiple subjects (e.g. Monet vs Manet → one entry per artist). Set to null for non-visual topics (philosophy, abstract concepts).',
    ),
  detectedArtwork: detectedArtworkSchema.describe(
    'Identified artwork from the user image or text, with an attribution-confidence score. Set to null when nothing is identified — never fabricate.',
  ),
  recommendations: z
    .array(z.string())
    .nullable()
    .describe(
      'In museum mode, 1-3 nearby artworks or rooms the visitor could explore next. Outside museum mode, 1-2 related artworks or topics. Set to null when nothing relevant.',
    ),
  expertiseSignal: z
    .enum(['beginner', 'intermediate', 'expert'])
    .nullable()
    .describe(
      'Detected visitor expertise level inferred from the question phrasing. Set to null when the signal is too weak to call.',
    ),
  citations: z
    .array(z.string())
    .nullable()
    .describe('Optional source identifiers used to ground the answer. Null when none.'),
});

export type MainAssistantOutput = z.infer<typeof mainAssistantOutputSchema>;
