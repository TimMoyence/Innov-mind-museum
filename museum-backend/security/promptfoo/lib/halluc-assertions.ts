/**
 * halluc-assertions.ts — T4.3 custom assertions for the halluc-corpus.
 *
 * Two pure functions surfaced to Promptfoo via the `javascript` assertion type
 * (or invoked directly from the unit test). Both are exported as plain
 * synchronous functions to keep the surface trivial and dependency-free; the
 * file MUST NOT import from the BE app modules (it runs in a thin Promptfoo
 * worker without `@modules/*` path aliases).
 *
 * `quoteInFacts(output, ctx)` — checks that every `source.quote` in the parsed
 * LLM output appears as an NFKC-normalized substring of the fact block.
 * Mirrors the spec D2 / NFR3 invariant: the `quote` field is the architectural
 * prevention lever per arXiv 2512.12117 (100% precision on 1080 responses via
 * verbatim string-match). Returns `pass: true` when every source matches;
 * `pass: false` on the first mismatch with a `reason` payload.
 *
 * `citeRealUrl(output, ctx)` — checks every `source.url` resolves to a host
 * that belongs to the V1 allowlist (Wikidata, Wikipedia, Wikimedia Commons,
 * the V1 museum domains the FE links out to, plus museum-catalog-internal
 * URLs the BE produces). This catches LLM-fabricated URLs early without
 * needing a network probe (that is `UrlHeadProbe`'s job — see T2.5).
 *
 * @see museum-backend/security/promptfoo/halluc.config.yaml
 * @see docs/adr/ADR-038-anti-hallucination-citations-websearch.md
 */

export interface CitationSourceLike {
  url?: string;
  title?: string;
  quote?: string;
  type?: string;
}

export interface AssertionContext {
  /** Concatenated fact blocks the LLM was given (Spotlighting envelope payload). */
  facts?: string;
  /** Optional list of fact blocks; concatenated if `facts` is absent. */
  factBlocks?: string[];
  /** Optional override of the URL allowlist (tests inject; production uses default). */
  allowlist?: readonly string[];
}

export interface AssertionResult {
  pass: boolean;
  reason?: string;
}

/**
 * Default URL allowlist for `citeRealUrl`. Hostnames only (no scheme, no path).
 * Wildcard suffix matching: an entry `wikipedia.org` matches `fr.wikipedia.org`,
 * `en.wikipedia.org`, `wikipedia.org`. NOT prefix-matched (would let
 * `evil.wikipedia.org.attacker.com` through).
 *
 * Keep this list narrow — every new entry expands the SSRF surface a hostile
 * LLM could exploit by writing `https://allowed.example/<attacker-controlled-path>`.
 */
export const DEFAULT_URL_ALLOWLIST: readonly string[] = Object.freeze([
  // Knowledge graph
  'wikidata.org',
  'www.wikidata.org',
  // Wikipedia (all language subdomains via suffix match)
  'wikipedia.org',
  // Wikimedia Commons + sister projects
  'commons.wikimedia.org',
  'upload.wikimedia.org',
  'wikimedia.org',
  // Major museum domains (V1 — Louvre, Orsay, Pompidou, MoMA, Met, V&A, Tate, Prado, Rijksmuseum, Uffizi, British Museum, Mauritshuis)
  'louvre.fr',
  'musee-orsay.fr',
  'centrepompidou.fr',
  'moma.org',
  'metmuseum.org',
  'vam.ac.uk',
  'tate.org.uk',
  'museodelprado.es',
  'rijksmuseum.nl',
  'uffizi.it',
  'britishmuseum.org',
  'mauritshuis.nl',
  // Musaium-internal museum catalog (the BE may emit these for in-house artworks)
  'musaium.app',
  'cdn.musaium.app',
]);

// Narrow no-break space (U+202F) + non-breaking space (U+00A0). Built from
// `String.fromCodePoint` so the source file stays ASCII-safe (the literal
// characters trip ESLint's `no-irregular-whitespace`).
const NBSP_FAMILY = new RegExp(
  `[${String.fromCodePoint(0x00a0)}${String.fromCodePoint(0x202f)}]`,
  'g',
);
const WS_RUN = /\s+/g;

/**
 * Normalize a candidate string for substring matching.
 *
 * @param s - The raw string to normalize.
 * @returns The NFKC-normalized, whitespace-collapsed, lowercased, trimmed form.
 */
export function normalizeForMatch(s: string): string {
  if (typeof s !== 'string') return '';
  return s.normalize('NFKC').replace(NBSP_FAMILY, ' ').replace(WS_RUN, ' ').trim().toLowerCase();
}

/** Try to read `sources[]` from an already-parsed object payload. */
function readSourcesFromObject(obj: Record<string, unknown>): CitationSourceLike[] {
  const direct = obj.sources;
  if (Array.isArray(direct)) return direct as CitationSourceLike[];
  const metadata =
    (obj.assistantMessage as Record<string, unknown> | undefined)?.metadata ?? obj.metadata;
  const nested = (metadata as Record<string, unknown> | undefined)?.sources;
  if (Array.isArray(nested)) return nested as CitationSourceLike[];
  return [];
}

/** Try to read `sources[]` from a string payload (JSON or `[META]{...}` trailer). */
function readSourcesFromString(text: string): CitationSourceLike[] {
  const metaIdx = text.lastIndexOf('[META]');
  if (metaIdx >= 0) {
    const jsonChunk = text.slice(metaIdx + '[META]'.length).trim();
    try {
      const parsed = JSON.parse(jsonChunk) as Record<string, unknown>;
      if (Array.isArray(parsed.sources)) return parsed.sources as CitationSourceLike[];
    } catch {
      // fall through
    }
  }
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    if (Array.isArray(parsed.sources)) return parsed.sources as CitationSourceLike[];
  } catch {
    // not JSON
  }
  return [];
}

/**
 * Parse a Promptfoo output value into a list of citation sources.
 *
 * @param output - The raw output from Promptfoo (string text or parsed JSON object).
 * @returns The list of citation sources, or `[]` when no parseable sources are found.
 */
export function extractSources(output: unknown): CitationSourceLike[] {
  if (!output) return [];
  if (typeof output === 'object') return readSourcesFromObject(output as Record<string, unknown>);
  if (typeof output === 'string') return readSourcesFromString(output);
  return [];
}

type ValidatedQuote = { ok: true; quote: string } | { ok: false; reason: string };

/** Type guard: source has a non-empty string quote (10..N chars). */
function validateQuoteField(s: CitationSourceLike): ValidatedQuote {
  if (typeof s.quote !== 'string' || s.quote.length === 0) {
    return { ok: false, reason: 'source missing quote field' };
  }
  if (s.quote.length < 10) {
    return {
      ok: false,
      reason: `quote too short (length ${String(s.quote.length)} < 10, would false-positive)`,
    };
  }
  return { ok: true, quote: s.quote };
}

/**
 * `quoteInFacts` — verify every `source.quote` is an NFKC-normalized substring
 * of the concatenated fact blocks.
 *
 * Empty source array = pass (the LLM emitted no sources; not this assertion's
 * job to demand presence — that's `cite_source` expected_behavior in the corpus).
 *
 * Empty / missing `facts` + non-empty sources = fail (LLM fabricated a source
 * without any grounding context).
 *
 * @param output - The raw Promptfoo output (string or parsed object).
 * @param ctx - Assertion context carrying `facts` (concatenated) or `factBlocks` (array).
 * @returns `{ pass: true }` when every source quote is grounded; `{ pass: false, reason }` otherwise.
 */
export function quoteInFacts(output: unknown, ctx: AssertionContext = {}): AssertionResult {
  const sources = extractSources(output);
  if (sources.length === 0) return { pass: true };

  const factsRaw = ctx.facts ?? (ctx.factBlocks ?? []).join('\n\n');
  if (factsRaw.trim() === '') {
    return {
      pass: false,
      reason: `${String(sources.length)} source(s) emitted but no facts were provided to ground them`,
    };
  }
  const factsNorm = normalizeForMatch(factsRaw);

  for (const s of sources) {
    const quoteCheck = validateQuoteField(s);
    if (!quoteCheck.ok) return { pass: false, reason: quoteCheck.reason };
    const q = normalizeForMatch(quoteCheck.quote);
    if (!factsNorm.includes(q)) {
      const urlLabel = typeof s.url === 'string' && s.url.length > 0 ? s.url : 'unknown';
      return { pass: false, reason: `quote not found in facts (url=${urlLabel})` };
    }
  }
  return { pass: true };
}

/**
 * Extract the hostname from a URL string. Locale-insensitive lowercase.
 *
 * @param raw - The URL string to parse.
 * @returns The lowercased hostname, or `''` when the URL fails to parse.
 */
function urlHost(raw: string): string {
  try {
    return new URL(raw).hostname.toLowerCase();
  } catch {
    return '';
  }
}

/**
 * Suffix-match a host against an allowlist entry. Entry `wikipedia.org` matches
 * `fr.wikipedia.org` (and `wikipedia.org` exactly) but NOT
 * `evil.wikipedia.org.attacker.com` (would require a substring match — we use
 * an `endsWith` guard with a dot boundary).
 *
 * @param host - The hostname being verified (already lowercased).
 * @param allow - The allowlist entry to compare against.
 * @returns `true` when host equals allow or is a dot-bounded subdomain of it.
 */
function hostMatches(host: string, allow: string): boolean {
  const a = allow.toLowerCase();
  return host === a || host.endsWith('.' + a);
}

/**
 * `citeRealUrl` — verify every `source.url` belongs to the allowlist.
 *
 * Empty source array = pass.
 * Source with missing / unparseable URL = fail.
 * Source URL hostname not on the allowlist = fail.
 *
 * @param output - The raw Promptfoo output (string or parsed object).
 * @param ctx - Assertion context carrying an optional `allowlist` override.
 * @returns `{ pass: true }` when every source URL belongs to the allowlist; `{ pass: false, reason }` otherwise.
 */
export function citeRealUrl(output: unknown, ctx: AssertionContext = {}): AssertionResult {
  const sources = extractSources(output);
  if (sources.length === 0) return { pass: true };
  const allow = ctx.allowlist ?? DEFAULT_URL_ALLOWLIST;

  for (const s of sources) {
    if (typeof s.url !== 'string' || s.url.length === 0) {
      return { pass: false, reason: 'source missing url field' };
    }
    const host = urlHost(s.url);
    if (!host) return { pass: false, reason: `unparseable URL: ${s.url}` };
    const ok = allow.some((entry) => hostMatches(host, entry));
    if (!ok) return { pass: false, reason: `url host "${host}" not on allowlist (url=${s.url})` };
  }
  return { pass: true };
}

/**
 * Promptfoo `javascript` assertion adapter — turns an `AssertionResult` into
 * the boolean+message return shape Promptfoo expects.
 *
 * Usage in a corpus entry:
 *   { "type": "javascript",
 *     "value": "return require('./lib/halluc-assertions').asPromptfooAssertion(
 *                  require('./lib/halluc-assertions').quoteInFacts(output, context.vars))" }
 *
 * @param result - The assertion result from `quoteInFacts` / `citeRealUrl`.
 * @returns Promptfoo-shaped `{ pass, score, reason }`.
 */
export function asPromptfooAssertion(result: AssertionResult): {
  pass: boolean;
  score: number;
  reason: string;
} {
  return {
    pass: result.pass,
    score: result.pass ? 1 : 0,
    reason: result.reason ?? (result.pass ? 'ok' : 'failed'),
  };
}
