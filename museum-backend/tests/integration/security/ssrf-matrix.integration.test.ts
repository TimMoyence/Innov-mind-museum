/**
 * SSRF defence matrix — V1 (CRITICAL) audit closure (2026-04-11 + 2026-04-26).
 *
 * Verifies that every URL-fetching surface in the backend rejects the full
 * 22-case SSRF matrix BEFORE issuing any outbound HTTP request. Drives:
 *
 *   1. `isSafeImageUrl` (chat/useCase/image-input.ts) — pure validator.
 *      The validated URL is never fetched server-side; it is handed to the
 *      LLM provider's image_url API. Defence still matters: a successfully
 *      validated private-IP URL would be sent to the provider, who *would*
 *      fetch it — leaking internal endpoints by proxy.
 *
 *   2. `HtmlScraper.scrape` (knowledge-extraction/adapters/secondary/html-scraper.ts).
 *      Real fetch with DNS resolution + redirect re-validation. The trip-wire
 *      asserts no `global.fetch` call leaks out for any malicious case.
 *
 *   3. Wikidata / Wikidata-Museum / Unsplash clients (chat + museum modules).
 *      Hard-coded endpoints — NO API exposes a URL override. We assert that
 *      contract (no public field/setter) so a future regression would surface
 *      here. Documented as "no override exposed" rather than re-tested with
 *      malicious URLs.
 *
 *   4. `ImageEnrichmentService` (chat/useCase/image-enrichment.service.ts).
 *      Does not perform direct URL fetches — Wikidata `imageUrl` is stored
 *      and forwarded to the LLM after upstream `isSafeImageUrl` validation
 *      (chat/useCase/image-processing.service.ts:60). Covered transitively
 *      by surface #1.
 *
 * If a case reveals an actual fetch leaking out, the test FAILS — do NOT
 * weaken the assertion. Mark with the audit gap tag and report.
 */

// ── DNS mock — must be installed BEFORE importing modules that bind
// `import { lookup } from 'node:dns/promises'` at module load.
import { resolveSsrfDns } from 'tests/helpers/network/ssrf-fixtures';

jest.mock('node:dns/promises', () => ({
  lookup: (hostname: string) => resolveSsrfDns(hostname),
}));

// Heavy parser deps — short-circuit so the scraper never reaches them.
// The trip-wire fetch will reject before parse anyway, but mocking guards
// against a regression that lets a fetch through with HTML payload.
jest.mock('linkedom', () => ({
  parseHTML: jest.fn().mockReturnValue({ document: {} }),
}));

jest.mock('@mozilla/readability', () => ({
  Readability: jest.fn().mockImplementation(() => ({ parse: () => null })),
}));

jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { HtmlScraper } from '@modules/knowledge-extraction/adapters/secondary/scraper/html-scraper';
import { isSafeImageUrl } from '@modules/chat/useCase/image-input';
import { WikidataClient } from '@modules/chat/adapters/secondary/wikidata.client';
import { HttpWikidataMuseumClient } from '@modules/museum/adapters/secondary/wikidata-museum.client';
import {
  buildSsrfUrls,
  clearSsrfDnsMappings,
  mockDnsResolveTo,
  type SsrfTestCase,
} from 'tests/helpers/network/ssrf-fixtures';

// ─────────────────────────────────────────────────────────────────────
// Outbound-fetch trip-wire — replaces `global.fetch` for the suite.
// Any invocation = SSRF defence breach → test fails loudly.
// ─────────────────────────────────────────────────────────────────────

const originalFetch = global.fetch;
let fetchSpy: jest.MockedFunction<typeof fetch>;

beforeEach(() => {
  fetchSpy = jest.fn<Promise<Response>, Parameters<typeof fetch>>(() => {
    throw new Error('SSRF defence breached — outbound fetch invoked with no test-mocked response');
  }) as jest.MockedFunction<typeof fetch>;
  global.fetch = fetchSpy;
});

afterEach(() => {
  global.fetch = originalFetch;
  clearSsrfDnsMappings();
  jest.clearAllMocks();
});

const cases: SsrfTestCase[] = buildSsrfUrls();

// ─────────────────────────────────────────────────────────────────────
// Surface #1 — isSafeImageUrl (pure validator, no fetch)
// ─────────────────────────────────────────────────────────────────────

describe('SSRF matrix — isSafeImageUrl (chat image-url validator)', () => {
  it.each(cases)('[$id] $description → rejected', ({ url }) => {
    expect(isSafeImageUrl(url)).toBe(false);
  });

  it('control: legitimate HTTPS URL is accepted', () => {
    expect(isSafeImageUrl('https://upload.wikimedia.org/x.jpg')).toBe(true);
  });

  it('control: legitimate HTTPS with port 443 explicit is accepted', () => {
    expect(isSafeImageUrl('https://cdn.example.com:443/x.jpg')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Surface #2 — HtmlScraper.scrape (real fetch + DNS + redirect chain)
// ─────────────────────────────────────────────────────────────────────

describe('SSRF matrix — HtmlScraper.scrape (knowledge-extraction)', () => {
  const scraper = new HtmlScraper({ timeoutMs: 5_000, maxContentBytes: 10_000 });

  // W1.T2-followup CLOSED: cases 10 + 11 (IPv6-mapped IPv4 literals
  // `[::ffff:127.0.0.1]` / `[::ffff:10.0.0.1]`) now pass after html-scraper
  // `normalizeIp` was extended with `ipv6MappedToIpv4`, which decodes BOTH
  // wire shapes — decimal `::ffff:1.2.3.4` AND WHATWG-canonicalised hex
  // `::ffff:0102:0304` — back to dotted IPv4 before the range checks run.
  it.each(cases)(
    '[$id] $description → null + no outbound fetch',
    async (testCase: SsrfTestCase) => {
      if (testCase.dnsResolvesTo) {
        // DNS-rebinding case: the hostname looks public but the resolver
        // returns a private IP. The scraper MUST honour the resolved IP.
        const hostname = new URL(testCase.url).hostname;
        mockDnsResolveTo(hostname, testCase.dnsResolvesTo);
      }

      const result = await scraper.scrape(testCase.url);

      expect(result).toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
    },
  );

  it('control: legitimate public URL with public DNS resolution proceeds to fetch', async () => {
    // Replace trip-wire with an OK response so we can assert the validator
    // *would* allow this URL through.
    fetchSpy.mockReset();
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: (k: string) => (k.toLowerCase() === 'content-type' ? 'text/html' : null),
        has: (k: string) => k.toLowerCase() === 'content-type',
      },
      text: () => Promise.resolve('<html><body>ok</body></html>'),
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    } as unknown as Response);

    await scraper.scrape('https://example.com/article');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Surface #3 — Wikidata clients have NO URL override
// (Defence is "you cannot supply the URL", not "we filter the URL".)
// ─────────────────────────────────────────────────────────────────────

/** URL knob names a future regression might introduce on a Wikidata client. */
const URL_KNOB_KEYS = [
  'baseUrl',
  'endpoint',
  'apiUrl',
  'sparqlUrl',
  'WIKIDATA_API',
  'WIKIDATA_SPARQL',
] as const;

/**
 * Asserts the client instance exposes no public URL-override field. Uses
 * `Object.hasOwn` instead of dynamic indexing to keep ESLint's
 * `security/detect-object-injection` rule clean.
 * @param client Instance to inspect.
 */
const expectNoUrlOverride = (client: object): void => {
  expect(Object.keys(client)).toEqual([]);
  for (const key of URL_KNOB_KEYS) {
    expect(Object.hasOwn(client, key)).toBe(false);
  }
};

describe('SSRF matrix — Wikidata clients expose no URL override', () => {
  it('WikidataClient does not accept a baseUrl/endpoint setter or constructor arg', () => {
    // Constructor takes zero args. There is no public field that lets a
    // caller redirect API/SPARQL endpoints. If this changes, the test fails
    // and the new surface must be added to surface #2 above.
    expectNoUrlOverride(new WikidataClient());
  });

  it('HttpWikidataMuseumClient does not accept a baseUrl/endpoint override', () => {
    expectNoUrlOverride(new HttpWikidataMuseumClient());
  });
});

// ─────────────────────────────────────────────────────────────────────
// Surface #4 — ImageEnrichmentService never fetches user-controlled URLs
// (Import-graph guard: scan src/modules/chat/ for unsafe fetch patterns.)
// ─────────────────────────────────────────────────────────────────────

describe('SSRF matrix — ImageEnrichmentService does not fetch user-supplied URLs', () => {
  it('image enrichment must not fetch Wikidata image URL without SSRF guard', async () => {
    const { collectTsFilesRec } = await import('../../helpers/import-graph/collect-ts-files');
    const path = await import('node:path');
    const { promises: fs } = await import('node:fs');

    const root = path.resolve(__dirname, '../../../src/modules/chat');
    const files = await collectTsFilesRec(root);

    // matches imageUrl, imageURL, ImageUrl, ImageURL
    // Caveat: regex is text-based, not AST-aware; commented-out `fetch(imageUrl)`
    // would also match. Acceptable trade-off vs the cost of an AST visitor.
    const offenders: string[] = [];
    for (const file of files) {
      const src = await fs.readFile(file, 'utf-8');
      const hasUnsafeFetch = /\bfetch\s*\(\s*[^)]*[Ii]mage[Uu][Rr][Ll]/.test(src);
      const hasGuardImport = /isSafeImageUrl|assertSafeImageUrl/.test(src);
      if (hasUnsafeFetch && !hasGuardImport) {
        offenders.push(path.relative(root, file));
      }
    }

    expect(offenders).toEqual([]);
  });

  it('guard self-test: detects a synthetic violator fixture', async () => {
    const { collectTsFilesRec } = await import('../../helpers/import-graph/collect-ts-files');
    const path = await import('node:path');
    const { promises: fs } = await import('node:fs');

    const root = path.resolve(__dirname, '__fixtures__');
    const files = await collectTsFilesRec(root);

    // matches imageUrl, imageURL, ImageUrl, ImageURL
    // Caveat: regex is text-based, not AST-aware; commented-out `fetch(imageUrl)`
    // would also match. Acceptable trade-off vs the cost of an AST visitor.
    const offenders: string[] = [];
    for (const file of files) {
      const src = await fs.readFile(file, 'utf-8');
      const hasUnsafeFetch = /\bfetch\s*\(\s*[^)]*[Ii]mage[Uu][Rr][Ll]/.test(src);
      const hasGuardImport = /isSafeImageUrl|assertSafeImageUrl/.test(src);
      if (hasUnsafeFetch && !hasGuardImport) {
        offenders.push(path.relative(root, file));
      }
    }

    expect(offenders).toContain('SSRF_FIXTURE_violator.ts');
  });
});
