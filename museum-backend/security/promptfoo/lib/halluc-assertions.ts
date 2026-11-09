export interface CitationSourceLike {
  url?: string;
  title?: string;
  quote?: string;
  type?: string;
}

export interface AssertionContext {
  facts?: string;
  factBlocks?: string[];
  allowlist?: readonly string[];
}

export interface AssertionResult {
  pass: boolean;
  reason?: string;
}

export const DEFAULT_URL_ALLOWLIST: readonly string[] = Object.freeze([
  'wikidata.org',
  'www.wikidata.org',
  'wikipedia.org',
  'commons.wikimedia.org',
  'upload.wikimedia.org',
  'wikimedia.org',
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
  'musaium.app',
  'cdn.musaium.app',
]);

const NBSP_FAMILY = new RegExp(
  `[${String.fromCodePoint(0x00a0)}${String.fromCodePoint(0x202f)}]`,
  'g',
);
const WS_RUN = /\s+/g;

export function normalizeForMatch(s: string): string {
  if (typeof s !== 'string') return '';
  return s.normalize('NFKC').replace(NBSP_FAMILY, ' ').replace(WS_RUN, ' ').trim().toLowerCase();
}

function readSourcesFromObject(obj: Record<string, unknown>): CitationSourceLike[] {
  const direct = obj.sources;
  if (Array.isArray(direct)) return direct as CitationSourceLike[];
  const metadata =
    (obj.assistantMessage as Record<string, unknown> | undefined)?.metadata ?? obj.metadata;
  const nested = (metadata as Record<string, unknown> | undefined)?.sources;
  if (Array.isArray(nested)) return nested as CitationSourceLike[];
  return [];
}

function readSourcesFromString(text: string): CitationSourceLike[] {
  const metaIdx = text.lastIndexOf('[META]');
  if (metaIdx >= 0) {
    const jsonChunk = text.slice(metaIdx + '[META]'.length).trim();
    try {
      const parsed = JSON.parse(jsonChunk) as Record<string, unknown>;
      if (Array.isArray(parsed.sources)) return parsed.sources as CitationSourceLike[];
    } catch {}
  }
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    if (Array.isArray(parsed.sources)) return parsed.sources as CitationSourceLike[];
  } catch {}
  return [];
}

export function extractSources(output: unknown): CitationSourceLike[] {
  if (!output) return [];
  if (typeof output === 'object') return readSourcesFromObject(output as Record<string, unknown>);
  if (typeof output === 'string') return readSourcesFromString(output);
  return [];
}

type ValidatedQuote = { ok: true; quote: string } | { ok: false; reason: string };

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

function urlHost(raw: string): string {
  try {
    return new URL(raw).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function hostMatches(host: string, allow: string): boolean {
  const a = allow.toLowerCase();
  return host === a || host.endsWith('.' + a);
}

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
