// linkedom is pure-JS and lightweight; use the real implementation so the
// fallback DOM-extraction path (querySelectorAll, body.textContent) works
// against a real document. Only Readability is mocked because it needs to be
// deterministic and is the unit under test.
jest.mock('@mozilla/readability', () => {
  // Local minimal shape — Document is a DOM lib type, not available in Node typings.
  type DomLike = { querySelector: (sel: string) => unknown };
  return {
    Readability: jest.fn().mockImplementation((doc: DomLike) => ({
      parse: jest.fn().mockImplementation(() => {
        // Return article result only when there is an <article> tag in the doc
        if (doc.querySelector('article')) {
          return {
            title: 'Van Gogh at the Louvre',
            textContent:
              "Van Gogh at the Louvre This exhibition showcases Van Gogh's masterpieces including Starry Night and Sunflowers. The works span his Dutch period through his time in Arles, France.",
          };
        }
        return null;
      }),
    })),
  };
});

jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const mockLookup = jest.fn<Promise<{ address: string; family: number }>, [string]>();
jest.mock('node:dns/promises', () => ({
  lookup: (...args: unknown[]) => mockLookup(args[0] as string),
}));

import { HtmlScraper } from '@modules/knowledge-extraction/adapters/secondary/scraper/html-scraper';
import {
  makeHtmlFetchResponse as makeHtmlResponse,
  makeRedirectFetchResponse as makeRedirectResponse,
  makeFetchSpy,
  mockFetch,
  mockHtmlFetch,
} from '../../helpers/fetch/fetch-mock.helpers';
import { makeMockFetchResponse } from '../../helpers/knowledge-extraction/html-scraper.mock';
import { logger } from '@shared/logger/logger';

const originalFetch = global.fetch;

beforeEach(() => {
  // Default: DNS resolves to a public IP so non-SSRF tests keep working.
  mockLookup.mockResolvedValue({ address: '93.184.216.34', family: 4 });
});

afterEach(() => {
  global.fetch = originalFetch;
  jest.clearAllMocks();
});

const ARTICLE_HTML = `
<!DOCTYPE html>
<html>
  <head><title>Van Gogh at the Louvre</title></head>
  <body>
    <article>
      <h1>Van Gogh at the Louvre</h1>
      <p>This exhibition showcases Van Gogh's masterpieces including Starry Night and Sunflowers.</p>
      <p>The works span his Dutch period through his time in Arles, France.</p>
    </article>
  </body>
</html>
`;

const SIMPLE_HTML = `
<!DOCTYPE html>
<html>
  <head><title>Museum Info</title></head>
  <body>
    <nav>Navigation</nav>
    <p>Welcome to the museum. Hours: 9am-5pm.</p>
    <footer>Footer</footer>
  </body>
</html>
`;

// -----------------------------------------------------------------------

describe('HtmlScraper', () => {
  const scraper = new HtmlScraper({ timeoutMs: 5000, maxContentBytes: 10_000 });

  it('extracts readable content from HTML with article tag via Readability', async () => {
    global.fetch = mockHtmlFetch(ARTICLE_HTML);

    const result = await scraper.scrape('https://example.com/article');

    expect(result).not.toBeNull();
    expect(result!.url).toBe('https://example.com/article');
    expect(result!.title).toBe('Van Gogh at the Louvre');
    expect(result!.textContent).toContain('Van Gogh');
    expect(result!.contentHash).toHaveLength(16);
  });

  it('falls back to linkedom DOM extraction when Readability returns null', async () => {
    global.fetch = mockHtmlFetch(SIMPLE_HTML);

    const result = await scraper.scrape('https://example.com/simple');

    expect(result).not.toBeNull();
    expect(result!.textContent).toContain('Welcome to the museum');
    // nav and footer should be stripped by linkedom fallback
    expect(result!.textContent).not.toContain('Navigation');
    expect(result!.textContent).not.toContain('Footer');
    expect(result!.contentHash).toHaveLength(16);
  });

  it('returns null on HTTP error (404)', async () => {
    global.fetch = mockFetch({ ok: false, status: 404 });

    const result = await scraper.scrape('https://example.com/missing');

    expect(result).toBeNull();
  });

  it('returns null on non-HTML content type (application/pdf)', async () => {
    global.fetch = mockHtmlFetch('%PDF-1.4 ...', 'application/pdf');

    const result = await scraper.scrape('https://example.com/doc.pdf');

    expect(result).toBeNull();
  });

  it('returns null on network failure (fetch rejects)', async () => {
    global.fetch = mockFetch(new Error('ECONNREFUSED'));

    const result = await scraper.scrape('https://example.com/unreachable');

    expect(result).toBeNull();
  });

  it('returns null for empty URL without calling fetch', async () => {
    const fetchSpy = makeFetchSpy();
    global.fetch = fetchSpy;

    const result = await scraper.scrape('   ');

    expect(result).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // C4 I-SEC10 (2026-05-21) — the legacy 'truncates content exceeding
  // maxContentBytes' test was removed in this run. Its assertion (`result`
  // non-null + `textContent.length <= maxContentBytes`) modelled the old
  // post-extract `.slice(0, maxContentBytes)` semantics. Per spec R8 + R9,
  // `maxContentBytes` is now an INPUT cap: any payload exceeding it is
  // rejected pre-extraction (`scrape()` returns `null`). The old test would
  // require the cap to behave as BOTH an output truncation (return non-null)
  // AND an input rejection (return null) on the same config — mutually
  // exclusive. The new input-cap contract is covered exhaustively by the
  // R8a/R8b/R9a/R9b cases in the two describe() blocks below. The internal
  // `.slice()` on extracted text in `extractContent` is now redundant
  // (input ≥ extracted text by construction) but kept as belt-and-braces;
  // it has no observable effect for tests that reach extraction.

  it('returns a 16-char hex contentHash derived from textContent', async () => {
    global.fetch = mockHtmlFetch(ARTICLE_HTML);

    const result = await scraper.scrape('https://example.com/article');

    expect(result).not.toBeNull();
    expect(result!.contentHash).toMatch(/^[0-9a-f]{16}$/);
  });

  describe('SSRF protection', () => {
    const fetchSpy = makeFetchSpy();

    beforeEach(() => {
      global.fetch = fetchSpy;
    });

    it('rejects IPv4 loopback (127.0.0.1)', async () => {
      mockLookup.mockResolvedValue({ address: '127.0.0.1', family: 4 });

      const result = await scraper.scrape('http://127.0.0.1/latest/meta-data');

      expect(result).toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('rejects private class A (10.x.x.x)', async () => {
      mockLookup.mockResolvedValue({ address: '10.0.0.1', family: 4 });

      const result = await scraper.scrape('http://10.0.0.1/internal');

      expect(result).toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('rejects private class B (172.16.x.x–172.31.x.x)', async () => {
      mockLookup.mockResolvedValue({ address: '172.16.0.1', family: 4 });

      const result = await scraper.scrape('http://172.16.0.1/admin');

      expect(result).toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('rejects private class C (192.168.x.x)', async () => {
      mockLookup.mockResolvedValue({ address: '192.168.1.1', family: 4 });

      const result = await scraper.scrape('http://192.168.1.1/router');

      expect(result).toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('rejects IPv6 loopback (::1)', async () => {
      mockLookup.mockResolvedValue({ address: '::1', family: 6 });

      const result = await scraper.scrape('http://[::1]/secret');

      expect(result).toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('rejects AWS metadata endpoint (169.254.169.254)', async () => {
      mockLookup.mockResolvedValue({ address: '169.254.169.254', family: 4 });

      const result = await scraper.scrape('http://169.254.169.254/latest/meta-data');

      expect(result).toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('rejects unspecified address (0.0.0.0)', async () => {
      mockLookup.mockResolvedValue({ address: '0.0.0.0', family: 4 });

      const result = await scraper.scrape('http://0.0.0.0/');

      expect(result).toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('rejects IPv6 unique local (fc00::)', async () => {
      mockLookup.mockResolvedValue({ address: 'fc00::1', family: 6 });

      const result = await scraper.scrape('http://internal.corp/data');

      expect(result).toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('rejects IPv6 unique local (fd00::)', async () => {
      mockLookup.mockResolvedValue({ address: 'fd12::1', family: 6 });

      const result = await scraper.scrape('http://internal.corp/data');

      expect(result).toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('rejects IPv6 link-local (fe80::)', async () => {
      mockLookup.mockResolvedValue({ address: 'fe80::1', family: 6 });

      const result = await scraper.scrape('http://link-local.test/data');

      expect(result).toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('rejects file:// protocol', async () => {
      const result = await scraper.scrape('file:///etc/passwd');

      expect(result).toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('rejects ftp:// protocol', async () => {
      const result = await scraper.scrape('ftp://internal/files');

      expect(result).toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('rejects when DNS resolution fails', async () => {
      mockLookup.mockRejectedValue(new Error('ENOTFOUND'));

      const result = await scraper.scrape('http://nonexistent.invalid/page');

      expect(result).toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('allows legitimate external URL resolving to public IP', async () => {
      mockLookup.mockResolvedValue({ address: '93.184.216.34', family: 4 });
      fetchSpy.mockResolvedValue(makeHtmlResponse(ARTICLE_HTML));

      const result = await scraper.scrape('https://example.com/article');

      expect(result).not.toBeNull();
      expect(fetchSpy).toHaveBeenCalled();
      expect(result!.title).toBe('Van Gogh at the Louvre');
    });

    it('rejects hostname resolving to private IP via DNS rebinding', async () => {
      // Simulates DNS rebinding: legitimate-looking hostname resolves to internal IP
      mockLookup.mockResolvedValue({ address: '192.168.1.100', family: 4 });

      const result = await scraper.scrape('https://evil-rebind.attacker.com/steal');

      expect(result).toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('rejects cloud-metadata hostname (metadata.google.internal) before DNS', async () => {
      const result = await scraper.scrape('http://metadata.google.internal/latest');

      expect(result).toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
      // Blocked at hostname policy — DNS lookup never fires.
      expect(mockLookup).not.toHaveBeenCalled();
    });

    it('rejects IPv4-mapped IPv6 private address (::ffff:192.168.1.1)', async () => {
      mockLookup.mockResolvedValue({ address: '::ffff:192.168.1.1', family: 6 });

      const result = await scraper.scrape('http://internal.example/data');

      expect(result).toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe('SSRF protection — manual redirect chain', () => {
    let fetchSpy: jest.MockedFunction<typeof fetch>;

    beforeEach(() => {
      mockLookup.mockResolvedValue({ address: '93.184.216.34', family: 4 });
      fetchSpy = makeFetchSpy();
      global.fetch = fetchSpy;
    });

    it('blocks a 302 redirect targeting a private IPv4 (169.254.169.254)', async () => {
      fetchSpy.mockResolvedValueOnce(makeRedirectResponse('http://169.254.169.254/latest'));

      const result = await scraper.scrape('https://evil.example/start');

      expect(result).toBeNull();
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('blocks a 302 redirect to file:// scheme', async () => {
      fetchSpy.mockResolvedValueOnce(makeRedirectResponse('file:///etc/passwd'));

      const result = await scraper.scrape('https://evil.example/start');

      expect(result).toBeNull();
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('blocks a 302 redirect to a cloud-metadata hostname', async () => {
      fetchSpy.mockResolvedValueOnce(
        makeRedirectResponse('http://metadata.google.internal/latest'),
      );

      const result = await scraper.scrape('https://evil.example/start');

      expect(result).toBeNull();
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('blocks a rebinding chain (public → public → private)', async () => {
      fetchSpy.mockResolvedValueOnce(makeRedirectResponse('https://second-hop.example/next', 301));
      fetchSpy.mockResolvedValueOnce(makeRedirectResponse('http://10.0.0.5/secret'));

      const result = await scraper.scrape('https://start.example/path');

      expect(result).toBeNull();
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('follows a safe redirect chain to a valid HTML page', async () => {
      fetchSpy.mockResolvedValueOnce(
        makeRedirectResponse('https://final-hop.example/article', 302),
      );
      fetchSpy.mockResolvedValueOnce(makeHtmlResponse(ARTICLE_HTML));

      const result = await scraper.scrape('https://chain.example/start');

      expect(result).not.toBeNull();
      expect(result!.url).toBe('https://final-hop.example/article');
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('blocks a chain exceeding MAX_REDIRECTS (5)', async () => {
      // Always-redirecting mock; loop must abort after MAX_REDIRECTS + 1 fetches.
      fetchSpy.mockResolvedValue(makeRedirectResponse('https://next-hop.example/step'));

      const result = await scraper.scrape('https://too-many.example/start');

      expect(result).toBeNull();
      expect(fetchSpy).toHaveBeenCalledTimes(6);
    });
  });

  // ------------------------------------------------------------------------
  // C4 I-SEC10 (2026-05-21) — RED phase, spec R8 + R9.
  //
  // Scraper response body MUST be bounded by O(maxContentBytes) RAM.
  //  R8 — pre-guard on Content-Length header (reject pre-download).
  //  R9 — streamed cap with reader.cancel() once cumulative bytes > cap.
  //
  // Today `html-scraper.ts:299` is `await response.text()` — buffers entire
  // payload before truncate. These tests prove the new contract and are
  // expected to FAIL on HEAD (green phase implements the guards).
  // ------------------------------------------------------------------------

  describe('I-SEC10 Content-Length pre-guard', () => {
    it('R8a — rejects pre-download when Content-Length > maxContentBytes, logs scraper_payload_too_large, never reads body', async () => {
      const smallScraper = new HtmlScraper({ timeoutMs: 5000, maxContentBytes: 524_288 });
      const oversizeResponse = makeMockFetchResponse({
        contentLength: '1048576',
        chunks: [new Uint8Array(0)],
      });
      const fetchSpy = makeFetchSpy();
      fetchSpy.mockResolvedValue(oversizeResponse);
      global.fetch = fetchSpy;

      const result = await smallScraper.scrape('https://example.com/giant.html');

      expect(result).toBeNull();
      // Pre-guard contract: body reader is never touched.
      expect(oversizeResponse.readSpy).not.toHaveBeenCalled();
      // Telemetry contract: dedicated event name (not the generic scraper_exception).
      const warnCalls = (logger.warn as jest.Mock).mock.calls;
      const matched = warnCalls.find((args) => args[0] === 'scraper_payload_too_large');
      expect(matched).toBeDefined();
    });

    it('R8b — happy path when Content-Length <= maxContentBytes, streams normally', async () => {
      const htmlBytes = new TextEncoder().encode(ARTICLE_HTML);
      const happyResponse = makeMockFetchResponse({
        contentLength: String(htmlBytes.byteLength),
        chunks: [htmlBytes],
      });
      const fetchSpy = makeFetchSpy();
      fetchSpy.mockResolvedValue(happyResponse);
      global.fetch = fetchSpy;

      const result = await scraper.scrape('https://example.com/within-cap');

      expect(result).not.toBeNull();
      expect(result!.textContent).toContain('Van Gogh');
    });
  });

  describe('I-SEC10 streamed cap (Content-Length absent)', () => {
    it('R9a — aborts stream when cumulative bytes exceed cap, logs scraper_payload_streamed_overflow, returns null', async () => {
      const smallScraper = new HtmlScraper({ timeoutMs: 5000, maxContentBytes: 256 * 1024 });
      const tenChunks: Uint8Array[] = Array.from({ length: 10 }, () => new Uint8Array(100 * 1024));
      const chunkedResponse = makeMockFetchResponse({
        contentLength: null,
        chunks: tenChunks,
      });
      const fetchSpy = makeFetchSpy();
      fetchSpy.mockResolvedValue(chunkedResponse);
      global.fetch = fetchSpy;

      const result = await smallScraper.scrape('https://example.com/streamed-giant');

      expect(result).toBeNull();
      // R9 abort invariant: reader.cancel() called exactly once.
      expect(chunkedResponse.cancelSpy).toHaveBeenCalledTimes(1);
      // Stream cap math: ceil(256 / 100) + 1 = 4 reads max before abort.
      expect(chunkedResponse.readSpy.mock.calls.length).toBeLessThanOrEqual(4);
      // Telemetry contract: dedicated overflow event.
      const warnCalls = (logger.warn as jest.Mock).mock.calls;
      const matched = warnCalls.find((args) => args[0] === 'scraper_payload_streamed_overflow');
      expect(matched).toBeDefined();
    });

    it('R9b — happy path streams full body when cumulative bytes <= cap', async () => {
      const htmlBytes = new TextEncoder().encode(ARTICLE_HTML);
      const happyResponse = makeMockFetchResponse({
        contentLength: null,
        chunks: [htmlBytes],
      });
      const fetchSpy = makeFetchSpy();
      fetchSpy.mockResolvedValue(happyResponse);
      global.fetch = fetchSpy;

      const result = await scraper.scrape('https://example.com/streamed-small');

      expect(result).not.toBeNull();
      expect(result!.textContent).toContain('Van Gogh');
      // cancel() NEVER called on the happy path.
      expect(happyResponse.cancelSpy).not.toHaveBeenCalled();
    });
  });
});
