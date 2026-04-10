// Mock heavy deps before importing the module under test to avoid ESM chain issues
// jsdom@29 has transitive ESM-only deps (@exodus/bytes) that ts-jest cannot transform.
jest.mock('jsdom', () => {
  return {
    JSDOM: jest.fn().mockImplementation((html: string, _opts?: unknown) => ({
      window: {
        document: { __html: html, title: '' },
      },
    })),
  };
});

jest.mock('@mozilla/readability', () => {
  return {
    Readability: jest.fn().mockImplementation((_doc: { __html?: string }) => ({
      parse: jest.fn().mockImplementation(() => {
        const html: string = (_doc as { __html?: string }).__html ?? '';
        // Return article result only when there is an <article> tag in the html
        if (html.includes('<article>')) {
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

import { HtmlScraper } from '@modules/knowledge-extraction/adapters/secondary/html-scraper';

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  jest.clearAllMocks();
});

// Helpers ----------------------------------------------------------------

function makeHtmlResponse(html: string, contentType = 'text/html; charset=utf-8') {
  return {
    ok: true,
    status: 200,
    headers: { get: (key: string) => (key === 'content-type' ? contentType : null) },
    text: async () => html,
  };
}

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
    global.fetch = jest
      .fn()
      .mockResolvedValue(makeHtmlResponse(ARTICLE_HTML)) as unknown as typeof fetch;

    const result = await scraper.scrape('https://example.com/article');

    expect(result).not.toBeNull();
    expect(result!.url).toBe('https://example.com/article');
    expect(result!.title).toBe('Van Gogh at the Louvre');
    expect(result!.textContent).toContain('Van Gogh');
    expect(result!.contentHash).toHaveLength(16);
  });

  it('falls back to cheerio extraction when Readability returns null', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(makeHtmlResponse(SIMPLE_HTML)) as unknown as typeof fetch;

    const result = await scraper.scrape('https://example.com/simple');

    expect(result).not.toBeNull();
    expect(result!.textContent).toContain('Welcome to the museum');
    // nav and footer should be stripped by cheerio fallback
    expect(result!.textContent).not.toContain('Navigation');
    expect(result!.textContent).not.toContain('Footer');
    expect(result!.contentHash).toHaveLength(16);
  });

  it('returns null on HTTP error (404)', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      headers: { get: () => null },
      text: async () => '',
    }) as unknown as typeof fetch;

    const result = await scraper.scrape('https://example.com/missing');

    expect(result).toBeNull();
  });

  it('returns null on non-HTML content type (application/pdf)', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        makeHtmlResponse('%PDF-1.4 ...', 'application/pdf'),
      ) as unknown as typeof fetch;

    const result = await scraper.scrape('https://example.com/doc.pdf');

    expect(result).toBeNull();
  });

  it('returns null on network failure (fetch rejects)', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch;

    const result = await scraper.scrape('https://example.com/unreachable');

    expect(result).toBeNull();
  });

  it('returns null for empty URL without calling fetch', async () => {
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;

    const result = await scraper.scrape('   ');

    expect(result).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('truncates content exceeding maxContentBytes', async () => {
    const smallScraper = new HtmlScraper({ timeoutMs: 5000, maxContentBytes: 20 });
    global.fetch = jest
      .fn()
      .mockResolvedValue(makeHtmlResponse(ARTICLE_HTML)) as unknown as typeof fetch;

    const result = await smallScraper.scrape('https://example.com/article');

    expect(result).not.toBeNull();
    expect(result!.textContent.length).toBeLessThanOrEqual(20);
  });

  it('returns a 16-char hex contentHash derived from textContent', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(makeHtmlResponse(ARTICLE_HTML)) as unknown as typeof fetch;

    const result = await scraper.scrape('https://example.com/article');

    expect(result).not.toBeNull();
    expect(result!.contentHash).toMatch(/^[0-9a-f]{16}$/);
  });
});
