export interface ScrapedPage {
  url: string;
  title: string;
  textContent: string;
  contentHash: string;
}

export interface ScraperPort {
  /** Returns null if scraping fails or is disallowed (SSRF policy). */
  scrape(url: string, signal?: AbortSignal): Promise<ScrapedPage | null>;
}
