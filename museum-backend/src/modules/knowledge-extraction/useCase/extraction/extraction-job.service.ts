import { ExtractedContentStatus } from '@modules/knowledge-extraction/domain/extracted-content/extracted-content.entity';
import { logger } from '@shared/logger/logger';

import type { ArtworkKnowledgeRepoPort } from '@modules/knowledge-extraction/domain/ports/artwork-knowledge-repo.port';
import type {
  ClassificationResult,
  ContentClassifierPort,
} from '@modules/knowledge-extraction/domain/ports/content-classifier.port';
import type { ExtractedContentRepoPort } from '@modules/knowledge-extraction/domain/ports/extracted-content-repo.port';
import type { MuseumEnrichmentRepoPort } from '@modules/knowledge-extraction/domain/ports/museum-enrichment-repo.port';
import type { ScraperPort } from '@modules/knowledge-extraction/domain/ports/scraper.port';

interface ExtractionJobConfig {
  /** Min confidence to auto-accept without review. */
  confidenceThreshold: number;
  /** Min confidence to store; below = discarded. */
  reviewThreshold: number;
  /** Days before a scraped URL is eligible for re-scraping. */
  refetchAfterDays: number;
}

interface ExtractionJobDeps {
  scraper: ScraperPort;
  classifier: ContentClassifierPort;
  contentRepo: ExtractedContentRepoPort;
  artworkRepo: ArtworkKnowledgeRepoPort;
  museumRepo: MuseumEnrichmentRepoPort;
}

/** Pipeline for a single URL: dedup → scrape → classify → store. */
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

  async processUrl(url: string, _searchTerm: string, locale: string): Promise<void> {
    try {
      // Dedup: skip if recently scraped
      const existing = await this.contentRepo.findByUrl(url);
      if (existing) {
        const ageMs = Date.now() - existing.scrapedAt.getTime();
        const ageDays = ageMs / (1000 * 60 * 60 * 24);
        if (ageDays < this.config.refetchAfterDays) {
          logger.info('extraction_skip_recent', { url, ageDays: Math.round(ageDays) });
          return;
        }
      }

      const page = await this.scraper.scrape(url);
      if (!page) {
        logger.warn('extraction_scrape_failed', { url });
        return;
      }

      await this.contentRepo.upsert({
        url: page.url,
        title: page.title,
        textContent: page.textContent,
        contentHash: page.contentHash,
        status: ExtractedContentStatus.SCRAPED,
      });

      const classification = await this.classifier.classify(page.textContent, locale);
      if (!classification) {
        await this.contentRepo.updateStatus(url, ExtractedContentStatus.FAILED);
        return;
      }

      if (classification.confidence < this.config.reviewThreshold) {
        await this.contentRepo.updateStatus(url, ExtractedContentStatus.LOW_CONFIDENCE);
        return;
      }

      const needsReview = classification.confidence < this.config.confidenceThreshold;

      await this.storeClassification(url, locale, classification, needsReview);
    } catch (err) {
      logger.error('extraction_job_error', {
        url,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Exhaustive on discriminant `type`. `irrelevant` stamps content row
   * LOW_CONFIDENCE (not CLASSIFIED) so it isn't misreported as success.
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
            // Hybrid-enrichment fields populated by `museum-enrichment` BullMQ
            // pipeline only; classification flow leaves them null so the
            // dedicated worker overwrites on first run.
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
        // Exhaustiveness guard — fails to compile if a new ClassificationResult variant is added.
        const _exhaustive: never = classification;
        return _exhaustive;
      }
    }
  }
}
