/**
 * Shared factories for the REAL Langfuse mask payloads (DRY — docs/TEST_FACTORIES.md).
 *
 * These factories build the EXACT `{ data }` shapes that
 * `langfuse-core@3.38.20` `maskEventBodyInPlace` passes to the configured
 * `mask` hook — verified against the installed library source (UFR-013) :
 *
 *   `node_modules/.pnpm/langfuse-core@3.38.20/.../lib/index.cjs.js:1301-1318`
 *     for (const key of ["input","output"]) {
 *       body[key] = this.mask({ data: body[key] });   // SEPARATELY, per key
 *     }
 *
 *   `node_modules/.pnpm/langfuse-langchain@3.38.20/.../lib/index.cjs.js`
 *     :273  generation({ input: messages })           // body.input = RAW ARRAY
 *     :284  prompts = messages.flatMap(m => extractChatMessageContent(m))
 *     :460-503 extractChatMessageContent → { content, role }  (content may be
 *               a string OR a multimodal array)
 *     :425  extractedOutput = isBaseMessage ? extractChatMessageContent(msg)
 *                                           : lastResponse.text  // STRING fallback
 *     :430  _updateGeneration({ output: extractedOutput })       // body.output
 *
 * So the mask hook RECEIVES (top-level, NOT wrapped in `{input|output|messages}`) :
 *   (a) `{ data: [ {content, role}, ... ] }`           — input array (per-key)
 *   (b) `{ data: { content, role } }`                  — output AIMessage object
 *   (c) `{ data: 'raw completion text' }`              — output string fallback
 *
 * The Cycle 2 tests / integration seed test asserted against the WRAPPER form
 * `{ data: { input: { messages }, output: { text } } }`, which the SDK NEVER
 * produces (it splits by key first). These factories feed the real forms so the
 * leak is provable in RED.
 *
 * lib-docs consulted (UFR-022) :
 *   - lib-docs/langfuse/PATTERNS.md §2.1 (mask: ({data}) => …) — ctor hook of
 *     signature (params:{data:any}) => any, conforms langfuse-core@3.38.20.
 *   - lib-docs/langfuse/PATTERNS.md §2.8 + §8.1 — CallbackHandler.handleLLMEnd /
 *     handleChatModelStart auto-capture input/output (the body shapes here).
 *   - lib-docs/langfuse/PATTERNS.md §3 DO #13 — one central mask hook.
 *   - lib-docs/langfuse/LESSONS.md LF-V3-05 — mask replaces free-text with
 *     '[STRIPPED]'; LF-V3-09 — CallbackHandler is the auto-capture vector.
 */

/** A single multimodal content part: user text. */
export interface TextPart {
  type: 'text';
  text: string;
}

/** A single multimodal content part: an image data-URL / signed URL. */
export interface ImageUrlPart {
  type: 'image_url';
  image_url: { url: string };
}

/** A LangChain-extracted message as emitted by `extractChatMessageContent`. */
export interface ExtractedMessage {
  content: string | Array<TextPart | ImageUrlPart>;
  role: string;
}

/**
 * Form (a) — input ARRAY. The mask receives `{ data: [ {content, role}, ... ] }`
 * because `maskEventBodyInPlace` calls `mask({ data: body.input })` and
 * `handleGenerationStart` set `body.input = messages` (the raw extracted array).
 *
 * @param messages the extracted-message array (defaults to a single user msg).
 */
export function makeInputArrayPayload(
  messages: ExtractedMessage[] = [{ role: 'user', content: 'default secret' }],
): { data: ExtractedMessage[] } {
  return { data: messages };
}

/**
 * Form (b) — output OBJECT `{ content, role }`. The mask receives
 * `{ data: { content, role } }` because `handleLLMEnd` sets
 * `body.output = extractChatMessageContent(AIMessage)` = `{ content, role }`.
 *
 * @param content the assistant reply (string or multimodal array).
 * @param role    the message role (defaults to 'assistant').
 */
export function makeOutputObjectPayload(
  content: string | Array<TextPart | ImageUrlPart>,
  role = 'assistant',
): { data: ExtractedMessage } {
  return { data: { content, role } };
}

/**
 * Form (c) — output STRING fallback. The mask receives `{ data: 'raw text' }`
 * because `handleLLMEnd` falls back to `lastResponse.text` (a bare string) when
 * the generation has no `BaseMessage`.
 *
 * @param text the raw completion text.
 */
export function makeOutputStringPayload(text: string): { data: string } {
  return { data: text };
}

/**
 * Convenience builder for a multimodal user message (the core product shape:
 * "photograph an artwork then chat") — a text part + an image data-URL part.
 *
 * @param text     the user's free text.
 * @param imageUrl the image data-URL / signed URL.
 */
export function makeMultimodalUserMessage(
  text: string,
  imageUrl: string,
  role = 'user',
): ExtractedMessage {
  return {
    role,
    content: [
      { type: 'text', text },
      { type: 'image_url', image_url: { url: imageUrl } },
    ],
  };
}
