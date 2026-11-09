export interface ScrapedPage {
  url: string;
  title: string;
  textContent: string;
  contentHash: string;
}

export interface ScraperPort {
  scrape(url: string, signal?: AbortSignal): Promise<ScrapedPage | null>;
}
