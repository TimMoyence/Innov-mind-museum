/**
 * halluc-assertions.spec.ts — T4.3 unit tests for the Promptfoo custom assertions.
 *
 * Importing from `security/promptfoo/lib/halluc-assertions.ts` is intentional: the
 * file lives outside `src/` because it executes inside Promptfoo's `javascript`
 * assertion worker (no `@modules/*` path aliases, no Express types). We test it
 * here so the BE Jest pipeline catches regressions on the same `pnpm test`
 * invocation that gates the rest of the chat module.
 */

import {
  citeRealUrl,
  DEFAULT_URL_ALLOWLIST,
  extractSources,
  normalizeForMatch,
  quoteInFacts,
} from '../../../security/promptfoo/lib/halluc-assertions';

describe('halluc-assertions / normalizeForMatch', () => {
  it('NFKC-normalizes width variants, collapses whitespace, lowercases, trims', () => {
    // Fullwidth A (U+FF21) → A ; non-breaking space U+00A0 + tab + LF → single space.
    const input = '   Ｌéonard\tde\nVinci  ';
    expect(normalizeForMatch(input)).toBe('léonard de vinci');
  });

  it('returns empty for non-string input', () => {
    expect(normalizeForMatch(null as unknown as string)).toBe('');
    expect(normalizeForMatch(undefined as unknown as string)).toBe('');
    expect(normalizeForMatch(42 as unknown as string)).toBe('');
  });
});

describe('halluc-assertions / extractSources', () => {
  it('reads sources array from a plain object', () => {
    const out = { sources: [{ url: 'https://x', quote: 'q1', title: 't', type: 'web' }] };
    expect(extractSources(out)).toHaveLength(1);
  });

  it('reads nested assistantMessage.metadata.sources', () => {
    const out = {
      assistantMessage: { metadata: { sources: [{ url: 'https://x', quote: 'q' }] } },
    };
    expect(extractSources(out)).toHaveLength(1);
  });

  it('reads trailing [META] block from a string output', () => {
    const out =
      'The Mona Lisa was painted by Leonardo da Vinci.\n[META]{"sources":[{"url":"https://www.wikidata.org/wiki/Q12418","quote":"Leonardo da Vinci painted","title":"Mona Lisa","type":"wikidata"}]}';
    const sources = extractSources(out);
    expect(sources).toHaveLength(1);
    expect(sources[0].url).toBe('https://www.wikidata.org/wiki/Q12418');
  });

  it('returns [] when no parseable sources', () => {
    expect(extractSources(null)).toEqual([]);
    expect(extractSources('plain answer with no meta block')).toEqual([]);
    expect(extractSources({ irrelevant: 'fields' })).toEqual([]);
  });
});

describe('halluc-assertions / quoteInFacts', () => {
  const facts =
    'Leonardo da Vinci painted the Mona Lisa in the early 16th century. It is currently held at the Louvre Museum in Paris.';

  it('passes when every quote is a substring of facts (case + width-insensitive)', () => {
    const output = {
      sources: [
        { url: 'https://x', title: 't', type: 'wikidata', quote: 'Leonardo da Vinci painted the Mona Lisa' },
        { url: 'https://y', title: 't2', type: 'web', quote: 'currently held at the Louvre Museum' },
      ],
    };
    expect(quoteInFacts(output, { facts })).toEqual({ pass: true });
  });

  it('passes vacuously when no sources are emitted (presence is not this rule)', () => {
    expect(quoteInFacts({ sources: [] }, { facts })).toEqual({ pass: true });
    expect(quoteInFacts('plain text', { facts })).toEqual({ pass: true });
  });

  it('fails when a quote is not in facts', () => {
    const output = {
      sources: [
        { url: 'https://x', title: 't', type: 'wikidata', quote: 'Mona Lisa was painted by Picasso' },
      ],
    };
    const r = quoteInFacts(output, { facts });
    expect(r.pass).toBe(false);
    expect(r.reason).toMatch(/quote not found/i);
  });

  it('fails when sources exist but facts are empty (fabrication signal)', () => {
    const output = { sources: [{ url: 'https://x', title: 't', quote: 'some quote here' }] };
    const r = quoteInFacts(output, { facts: '' });
    expect(r.pass).toBe(false);
    expect(r.reason).toMatch(/no facts/i);
  });

  it('fails when a quote is too short (< 10 chars — anti false-positive)', () => {
    const output = { sources: [{ url: 'https://x', title: 't', quote: 'tiny' }] };
    const r = quoteInFacts(output, { facts });
    expect(r.pass).toBe(false);
    expect(r.reason).toMatch(/too short/i);
  });

  it('fails when a quote field is missing', () => {
    const output = { sources: [{ url: 'https://x', title: 't' } as unknown as { quote: string }] };
    const r = quoteInFacts(output, { facts });
    expect(r.pass).toBe(false);
    expect(r.reason).toMatch(/quote/i);
  });

  it('treats NFKC equivalence and whitespace collapse as a match', () => {
    const factsFancy =
      'Léonard de Vinci\ta peint la Joconde au début du XVIe siècle.';
    const output = { sources: [{ url: 'https://x', title: 't', quote: 'Léonard de Vinci a peint la Joconde' }] };
    expect(quoteInFacts(output, { facts: factsFancy })).toEqual({ pass: true });
  });
});

describe('halluc-assertions / citeRealUrl', () => {
  it('passes for Wikidata, Wikipedia subdomains, Wikimedia Commons', () => {
    const output = {
      sources: [
        { url: 'https://www.wikidata.org/wiki/Q12418', quote: 'qqqqqqqqqq', title: 't', type: 'wikidata' },
        { url: 'https://fr.wikipedia.org/wiki/La_Joconde', quote: 'qqqqqqqqqq', title: 't', type: 'web' },
        { url: 'https://commons.wikimedia.org/wiki/File:X.jpg', quote: 'qqqqqqqqqq', title: 't', type: 'commons' },
      ],
    };
    expect(citeRealUrl(output)).toEqual({ pass: true });
  });

  it('passes for major museum domains', () => {
    const output = {
      sources: [
        { url: 'https://www.louvre.fr/en/works', quote: 'qqqqqqqqqq', title: 't' },
        { url: 'https://www.metmuseum.org/art/collection/search/123', quote: 'qqqqqqqqqq', title: 't' },
        { url: 'https://www.tate.org.uk/art/artworks/x', quote: 'qqqqqqqqqq', title: 't' },
      ],
    };
    expect(citeRealUrl(output)).toEqual({ pass: true });
  });

  it('fails for an off-allowlist host', () => {
    const output = { sources: [{ url: 'https://attacker.example/leak', quote: 'qqqqqqqqqq', title: 't' }] };
    const r = citeRealUrl(output);
    expect(r.pass).toBe(false);
    expect(r.reason).toMatch(/not on allowlist/);
  });

  it('rejects a homograph attempt where allowlist is a substring not a suffix', () => {
    // evil.wikipedia.org.attacker.com should be REJECTED — `endsWith('.wikipedia.org')`
    // boundary check protects us.
    const output = {
      sources: [{ url: 'https://evil.wikipedia.org.attacker.com/leak', quote: 'qqqqqqqqqq', title: 't' }],
    };
    const r = citeRealUrl(output);
    expect(r.pass).toBe(false);
  });

  it('fails for an unparseable URL', () => {
    const output = { sources: [{ url: 'not a url', quote: 'qqqqqqqqqq', title: 't' }] };
    const r = citeRealUrl(output);
    expect(r.pass).toBe(false);
    expect(r.reason).toMatch(/unparseable/i);
  });

  it('passes vacuously when no sources are emitted', () => {
    expect(citeRealUrl('plain answer')).toEqual({ pass: true });
    expect(citeRealUrl({ sources: [] })).toEqual({ pass: true });
  });

  it('honors caller-supplied allowlist override', () => {
    const output = { sources: [{ url: 'https://internal.musaium.test/x', quote: 'qqqqqqqqqq', title: 't' }] };
    expect(citeRealUrl(output, { allowlist: ['musaium.test'] })).toEqual({ pass: true });
    // default allowlist rejects it
    expect(citeRealUrl(output).pass).toBe(false);
  });

  it('DEFAULT_URL_ALLOWLIST is frozen (cannot be mutated by accident)', () => {
    expect(Object.isFrozen(DEFAULT_URL_ALLOWLIST)).toBe(true);
  });
});
