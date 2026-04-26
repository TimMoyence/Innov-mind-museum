import { logger } from '@shared/logger/logger';

import { ExtractedContentStatus } from '../domain/extracted-content.entity';

import type { ArtworkKnowledgeRepoPort } from '../domain/ports/artwork-knowledge-repo.port';
import type {
  ClassificationResult,
  ContentClassifierPort,
} from '../domain/ports/content-classifier.port';
import type { ExtractedContentRepoPort } from '../domain/ports/extracted-content-repo.port';
import type { MuseumEnrichmentRepoPort } from '../domain/ports/museum-enrichment-repo.port';
import type { ScraperPort } from '../domain/ports/scraper.port';

/** Configuration thresholds and TTL for the extraction pipeline. */
interface ExtractionJobConfig {
  /** Minimum confidence to auto-accept without review. */
  confidenceThreshold: number;
  /** Minimum confidence to store at all; below this the result is discarded. */
  reviewThreshold: number;
  /** Number of days before a previously scraped URL is eligible for re-scraping. */
  refetchAfterDays: number;
}

/** Dependencies for the extraction job service. */
interface ExtractionJobDeps {
  scraper: ScraperPort;
  classifier: ContentClassifierPort;
  contentRepo: ExtractedContentRepoPort;
  artworkRepo: ArtworkKnowledgeRepoPort;
  museumRepo: MuseumEnrichmentRepoPort;
}

/** Orchestrates the full extraction pipeline for a single URL: dedup → scrape → classify → store. */
export class ExtractionJobService {
  private readonly scraper: ScraperPort;
  private readonly classifier: ContentClassifierPort;
  private readonly contentRepo: ExtractedContentRepoPort;
  private readonly artworkRepo: ArtworkKnowledgeRepoPort;
  private readonly museumRepo: MuseumEnrichmentRepoPort;

  constructor(
    deps: ExtractionJobDeps,
    private readonly config: ExtractionJobConfig,
  ) {
    this.scraper = deps.scraper;
    this.classifier = deps.classifier;
    this.contentRepo = deps.contentRepo;
    this.artworkRepo = deps.artworkRepo;
    this.museumRepo = deps.museumRepo;
  }

  /** Processes a single URL through the extraction pipeline. */
  async processUrl(url: string, _searchTerm: string, locale: string): Promise<void> {
    try {
      // 1. Dedup: skip if recently scraped
      const existing = await this.contentRepo.findByUrl(url);
      if (existing) {
        const ageMs = Date.now() - existing.scrapedAt.getTime();
        const ageDays = ageMs / (1000 * 60 * 60 * 24);
        if (ageDays < this.config.refetchAfterDays) {
          logger.info('extraction_skip_recent', { url, ageDays: Math.round(ageDays) });
          return;
        }
      }

      // 2. Scrape
      const page = await this.scraper.scrape(url);
      if (!page) {
        logger.warn('extraction_scrape_failed', { url });
        return;
      }

      // 3. Store raw content
      await this.contentRepo.upsert({
        url: page.url,
        title: page.title,
        textContent: page.textContent,
        contentHash: page.contentHash,
        status: ExtractedContentStatus.SCRAPED,
      });

      // 4. Classify
      const classification = await this.classifier.classify(page.textContent, locale);
      if (!classification) {
        await this.contentRepo.updateStatus(url, ExtractedContentStatus.FAILED);
        return;
      }

      // 5. Below review threshold → skip
      if (classification.confidence < this.config.reviewThreshold) {
        await this.contentRepo.updateStatus(url, ExtractedContentStatus.LOW_CONFIDENCE);
        return;
      }

      const needsReview = classification.confidence < this.config.confidenceThreshold;

      // 6. Store structured data — exhaustive branching on the discriminant.
      await this.storeClassification(url, locale, classification, needsReview);
    } catch (err) {
      logger.error('extraction_job_error', {
        url,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Persists a classification result. Exhaustive on the discriminant `type`.
   * - `artwork` / `museum` → upsert structured row + stamp content row CLASSIFIED.
   * - `irrelevant` → leave structured tables alone, stamp content row LOW_CONFIDENCE
   *   so it isn't misreported as a successful classification.
   */
  private async storeClassification(
    url: string,
    locale: string,
    classification: ClassificationResult,
    needsReview: boolean,
  ): Promise<void> {
    switch (classification.type) {
      case 'artwork':
        await this.artworkRepo.upsertFromClassification(
          {
            ...classification.data,
            sourceUrls: [url],
            confidence: classification.confidence,
            needsReview,
            locale,
          },
          url,
        );
        await this.contentRepo.updateStatus(url, ExtractedContentStatus.CLASSIFIED);
        logger.info('extraction_success', {
          url,
          type: classification.type,
          confidence: classification.confidence,
          needsReview,
        });
        return;
      case 'museum':
        await this.museumRepo.upsertFromClassification(
          {
            ...classification.data,
            museumId: null,
            sourceUrls: [url],
            confidence: classification.confidence,
            needsReview,
            locale,
            // Hybrid-enrichment fields are populated only by the
            // `museum-enrichment` BullMQ pipeline; the classification flow
            // owns the scraped-description path and leaves them null so the
            // dedicated worker can overwrite on first run.
            summary: null,
            wikidataQid: null,
            phone: null,
            imageUrl: null,
            fetchedAt: new Date(),
          },
          url,
        );
        await this.contentRepo.updateStatus(url, ExtractedContentStatus.CLASSIFIED);
        logger.info('extraction_success', {
          url,
          type: classification.type,
          confidence: classification.confidence,
          needsReview,
        });
        return;
      case 'irrelevant':
        await this.contentRepo.updateStatus(url, ExtractedContentStatus.LOW_CONFIDENCE);
        logger.info('extraction_irrelevant', { url, confidence: classification.confidence });
        return;
      default: {
        // Exhaustiveness guard — `classification` narrows to `never` when all
        // discriminant cases are handled. If a new variant is added to
        // ClassificationResult without a case here, this assignment fails to compile.
        const _exhaustive: never = classification;
        return _exhaustive;
      }
    }
  }
}
