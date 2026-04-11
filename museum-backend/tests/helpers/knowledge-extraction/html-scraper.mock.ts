import type {
  ScrapedPage,
  ScraperPort,
} from '@modules/knowledge-extraction/domain/ports/scraper.port';

/** Jest mock for HtmlScraper — avoids loading jsdom (ESM-only transitive deps) in unit tests. */
export class HtmlScraper implements ScraperPort {
  async scrape(_url: string): Promise<ScrapedPage | null> {
    return null;
  }
}
