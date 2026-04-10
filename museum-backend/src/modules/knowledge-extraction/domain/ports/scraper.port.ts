/** Result of scraping a single URL. */
export interface ScrapedPage {
  url: string;
  title: string;
  textContent: string;
  contentHash: string;
}

/** Port for HTML scraping adapters. */
export interface ScraperPort {
  /** Scrapes the given URL. Returns null if scraping fails or is disallowed. */
  scrape(url: string, signal?: AbortSignal): Promise<ScrapedPage | null>;
}
