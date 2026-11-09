import { resolveSsrfDns } from 'tests/helpers/network/ssrf-fixtures';

jest.mock('node:dns/promises', () => ({
  lookup: (hostname: string) => resolveSsrfDns(hostname),
}));

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
import { isSafeImageUrl } from '@modules/chat/useCase/image/image-input';
import { WikidataClient } from '@modules/chat/adapters/secondary/search/wikidata.client';
import { HttpWikidataMuseumClient } from '@modules/museum/adapters/secondary/external/wikidata-museum.client';
import {
  buildSsrfUrls,
  clearSsrfDnsMappings,
  mockDnsResolveTo,
  type SsrfTestCase,
} from 'tests/helpers/network/ssrf-fixtures';

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

describe('SSRF matrix — HtmlScraper.scrape (knowledge-extraction)', () => {
  const scraper = new HtmlScraper({ timeoutMs: 5_000, maxContentBytes: 10_000 });

  it.each(cases)(
    '[$id] $description → null + no outbound fetch',
    async (testCase: SsrfTestCase) => {
      if (testCase.dnsResolvesTo) {
        const hostname = new URL(testCase.url).hostname;
        mockDnsResolveTo(hostname, testCase.dnsResolvesTo);
      }

      const result = await scraper.scrape(testCase.url);

      expect(result).toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
    },
  );

  it('control: legitimate public URL with public DNS resolution proceeds to fetch', async () => {
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

const URL_KNOB_KEYS = [
  'baseUrl',
  'endpoint',
  'apiUrl',
  'sparqlUrl',
  'WIKIDATA_API',
  'WIKIDATA_SPARQL',
] as const;

const expectNoUrlOverride = (client: object): void => {
  expect(Object.keys(client)).toEqual([]);
  for (const key of URL_KNOB_KEYS) {
    expect(Object.hasOwn(client, key)).toBe(false);
  }
};

describe('SSRF matrix — Wikidata clients expose no URL override', () => {
  it('WikidataClient does not accept a baseUrl/endpoint setter or constructor arg', () => {
    expectNoUrlOverride(new WikidataClient());
  });

  it('HttpWikidataMuseumClient does not accept a baseUrl/endpoint override', () => {
    expectNoUrlOverride(new HttpWikidataMuseumClient());
  });
});

describe('SSRF matrix — ImageEnrichmentService does not fetch user-supplied URLs', () => {
  it('image enrichment must not fetch Wikidata image URL without SSRF guard', async () => {
    const { collectTsFilesRec } = await import('../../helpers/import-graph/collect-ts-files');
    const path = await import('node:path');
    const { promises: fs } = await import('node:fs');

    const root = path.resolve(__dirname, '../../../src/modules/chat');
    const files = await collectTsFilesRec(root);

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
