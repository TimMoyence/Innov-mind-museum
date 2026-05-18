/**
 * Pure helper sanitising a raw QR-cartel payload before it is embedded in
 * the LLM lookup template (`chat.cartelScanner.lookup_template`) sent through
 * `sendMessage({ text })`.
 *
 * Layered defence (mirrors `museum-backend/src/shared/validation/input.ts`
 * `sanitizePromptInput()`, doubled on the FE so that NO raw barcode payload
 * ever enters the prompt path even if the BE sanitiser is bypassed) :
 *
 *   1. NFKC Unicode normalisation — folds full-width digits / compatibility
 *      forms to their ASCII equivalents.
 *   2. Strip zero-width + BOM + soft-hyphen + control chars
 *      (U+200B-U+200D, U+FEFF, U+2060, U+00AD, \x00-\x1F, \x7F).
 *   3. Truncate at the first angle bracket (`<` / `>`) — defence vs
 *      HTML/script smuggling. Without this, `<script>alert</script>` would
 *      leak `scriptalertscript` through the whitelist concat.
 *   4. Whitelist `[A-Za-z0-9._-]` only — every other character is dropped.
 *      Neutralises prompt-injection markers such as
 *      `[END OF SYSTEM INSTRUCTIONS]` => `ENDOFSYSTEMINSTRUCTIONS`.
 *   5. Trim surrounding whitespace.
 *   6. Slice to {@link SANITIZE_MAX_LEN} characters.
 *
 * Returns `null` for empty input, whitespace-only input, or non-string types
 * (defensive guard — the native barcode event payload claims `data: string`
 * but the runtime may misbehave).
 *
 * Spec: docs/chat-ux-refonte/specs/B4.md §1.5 (R19) + §2.3 + AC1-AC8.
 *
 * @module features/chat/application/sanitizeCartelCode
 */

/** Maximum length of the sanitised cartel code (defence vs oversized QR payloads). */
export const SANITIZE_MAX_LEN = 64;

/**
 * Zero-width + BOM + soft-hyphen + control characters that must be stripped
 * before the alphanumeric whitelist runs (otherwise they survive as gaps).
 *
 * - U+200B / U+200C / U+200D : zero-width space / non-joiner / joiner.
 * - U+FEFF                  : zero-width no-break space (BOM).
 * - U+2060                  : word joiner.
 * - U+00AD                  : soft hyphen.
 * - \x00-\x1F               : C0 control characters (TAB, LF, CR, NUL, etc.).
 * - \x7F                    : DEL.
 */
// eslint-disable-next-line no-control-regex -- justification: sanitiser must strip C0 control bytes from native barcode payload (defence vs zero-width smuggling); Approved-by: B4-green-2026-05-14
const ZERO_WIDTH_AND_CONTROL_RE = /[\u200B-\u200D\u2060\uFEFF\u00AD\x00-\x1F\x7F]/g;

/** Anything outside `[A-Za-z0-9._-]` is forbidden in the canonical catalog code. */
const FORBIDDEN_RE = /[^A-Za-z0-9._-]/g;

/** Pre-compiled angle-bracket finder used for the script-smuggling truncation. */
const ANGLE_BRACKET_RE = /[<>]/;

/**
 * Sanitises a raw cartel code (QR payload). Returns the canonical alphanumeric
 * residue or `null` if no character survived.
 *
 * Angle-bracketed HTML/script payloads (`ABC<script>` => `ABC`) are truncated
 * at the first `<` or `>` BEFORE the whitelist concat pass — otherwise a
 * payload like `<script>alert</script>` would leak `scriptalertscript`. The
 * prompt-injection marker `[END OF SYSTEM INSTRUCTIONS]` does NOT contain
 * angle brackets, so its alphanumeric residue is concatenated by the
 * whitelist pass (R19 => AC8 = `ENDOFSYSTEMINSTRUCTIONS`).
 */
export function sanitizeCartelCode(raw: string): string | null {
  if (typeof raw !== 'string') return null;
  const normalised = raw.normalize('NFKC');
  const stripped = normalised.replace(ZERO_WIDTH_AND_CONTROL_RE, '');
  const angleIndex = stripped.search(ANGLE_BRACKET_RE);
  const truncated = angleIndex === -1 ? stripped : stripped.slice(0, angleIndex);
  const filtered = truncated.replace(FORBIDDEN_RE, '');
  const trimmed = filtered.trim();
  if (trimmed.length === 0) return null;
  return trimmed.slice(0, SANITIZE_MAX_LEN);
}

/**
 * W3 intra-musée — strict RFC 4122 v4 UUID regex used to validate each segment
 * of a `musaium://` deeplink. Lower or upper hex accepted; version nibble must
 * be `4`; variant nibble must be one of `8|9|a|b`.
 *
 * Defence rationale (design.md §7) — the legacy {@link sanitizeCartelCode}
 * whitelist `[A-Za-z0-9._-]` is TOO NARROW for UUIDs (preserves `-` but the
 * `://` and `?room=` framing collapses to junk). Deeplink path MUST validate
 * via the regex below and short-circuit `null` on ANY deviation. Injection
 * surfaces blocked: `javascript:` / `data:` schemes, extra query params,
 * non-v4 UUIDs, malformed segments.
 */
const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Shape returned by {@link parseMusaiumDeeplink} on a successful parse.
 * `roomId` is `null` (not absent) when the deeplink omits the `?room=` query.
 */
export interface MusaiumDeeplink {
  readonly museumId: string;
  readonly artworkId: string;
  readonly roomId: string | null;
}

/**
 * Parses a Musaium QR-cartel deeplink of the form
 * `musaium://museum/<uuid-v4>/artwork/<uuid-v4>[?room=<uuid-v4>]`.
 *
 * Returns `null` for ANY of:
 *   - non-string input
 *   - scheme other than `musaium:` (rejects `javascript:`, `data:`, `http(s):`)
 *   - host other than `museum`
 *   - path segments other than `museum/<uuid>/artwork/<uuid>` shape
 *   - any UUID segment failing the v4 regex (`UUID_V4_RE`)
 *   - any query parameter other than `room`
 *   - `room` value failing v4 regex
 *   - any URL fragment present
 *
 * Callers MUST prefer this parser BEFORE falling back to
 * {@link sanitizeCartelCode} — the alphanumeric whitelist would corrupt UUID
 * `-` separators if let to run first. Spec R19/R20 + design §7.
 *
 * @param raw Raw QR payload as emitted by the camera barcode event.
 */
export function parseMusaiumDeeplink(raw: string): MusaiumDeeplink | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  // Hard length cap defends against worst-case regex backtracking on hostile
  // input (UUIDs + scheme + path ≤ 256 chars in normal use).
  if (trimmed.length > 256) return null;
  if (!trimmed.toLowerCase().startsWith('musaium://')) return null;

  // Reject any fragment — never expected in a cartel deeplink, often used to
  // smuggle markers past path validators.
  if (trimmed.includes('#')) return null;

  // Split off the optional query string first (only `?room=<uuid>` allowed).
  const queryIdx = trimmed.indexOf('?');
  const pathPart = queryIdx === -1 ? trimmed : trimmed.slice(0, queryIdx);
  const queryPart = queryIdx === -1 ? null : trimmed.slice(queryIdx + 1);

  // Body after `musaium://` — case preserved for UUIDs (the regex is case-insensitive).
  const body = pathPart.slice('musaium://'.length);
  const segments = body.split('/');
  if (segments.length !== 4) return null;
  const [host, museumId, artworkLiteral, artworkId] = segments as [string, string, string, string];
  if (host.toLowerCase() !== 'museum') return null;
  if (artworkLiteral.toLowerCase() !== 'artwork') return null;
  if (!UUID_V4_RE.test(museumId)) return null;
  if (!UUID_V4_RE.test(artworkId)) return null;

  let roomId: string | null = null;
  if (queryPart !== null) {
    if (queryPart.length === 0) return null;
    // Single allowed key: `room=<uuid>`. Anything else (extra `&`, unknown
    // keys, repeated `room=`) is rejected.
    if (queryPart.includes('&')) return null;
    const eqIdx = queryPart.indexOf('=');
    if (eqIdx === -1) return null;
    const key = queryPart.slice(0, eqIdx);
    const value = queryPart.slice(eqIdx + 1);
    if (key.toLowerCase() !== 'room') return null;
    if (!UUID_V4_RE.test(value)) return null;
    roomId = value;
  }

  return { museumId, artworkId, roomId };
}
