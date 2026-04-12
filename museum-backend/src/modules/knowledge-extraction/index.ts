import { logger } from '@shared/logger/logger';
import { env } from '@src/config/env';

import { ExtractionWorker } from './adapters/primary/extraction.worker';
import { HtmlScraper } from './adapters/secondary/html-scraper';
import { TypeOrmArtworkKnowledgeRepo } from './adapters/secondary/typeorm-artwork-knowledge.repo';
import { TypeOrmExtractedContentRepo } from './adapters/secondary/typeorm-extracted-content.repo';
import { TypeOrmMuseumEnrichmentRepo } from './adapters/secondary/typeorm-museum-enrichment.repo';
import { ArtworkKnowledge } from './domain/artwork-knowledge.entity';
import { ExtractedContent } from './domain/extracted-content.entity';
import { MuseumEnrichment } from './domain/museum-enrichment.entity';
import { ContentClassifierService } from './useCase/content-classifier.service';
import { DbLookupService } from './useCase/db-lookup.service';
import { ExtractionJobService } from './useCase/extraction-job.service';

import type { ExtractionQueuePort } from './domain/ports/extraction-queue.port';
import type { DataSource } from 'typeorm';

/** Built module output -- consumed by ChatModule. */
export interface BuiltKnowledgeExtractionModule {
  dbLookup: DbLookupService;
  extractionQueue?: ExtractionQueuePort;
  close: () => Promise<void>;
}

/** Builds and wires the knowledge-extraction module. */
export class KnowledgeExtractionModule {
  /** Builds all services from a DataSource. */
  build(dataSource: DataSource): BuiltKnowledgeExtractionModule {
    const contentRepo = new TypeOrmExtractedContentRepo(dataSource.getRepository(ExtractedContent));
    const artworkRepo = new TypeOrmArtworkKnowledgeRepo(dataSource.getRepository(ArtworkKnowledge));
    const museumRepo = new TypeOrmMuseumEnrichmentRepo(dataSource.getRepository(MuseumEnrichment));
    const dbLookup = new DbLookupService(artworkRepo, museumRepo);

    if (!env.featureFlags.knowledgeExtraction) {
      logger.info('knowledge_extraction_disabled');
      return { dbLookup, close: () => Promise.resolve() };
    }

    const openaiKey = env.llm.openAiApiKey;
    if (!openaiKey) {
      logger.warn('knowledge_extraction_no_openai_key', {
        reason: 'OPENAI_API_KEY required for content classification',
      });
      return { dbLookup, close: () => Promise.resolve() };
    }

    return this.buildPipeline(dbLookup, openaiKey, contentRepo, artworkRepo, museumRepo);
  }

  /** Wires the full extraction pipeline (scraper + classifier + worker). */
  private buildPipeline(
    dbLookup: DbLookupService,
    openaiKey: string,
    contentRepo: TypeOrmExtractedContentRepo,
    artworkRepo: TypeOrmArtworkKnowledgeRepo,
    museumRepo: TypeOrmMuseumEnrichmentRepo,
  ): BuiltKnowledgeExtractionModule {
    const scraper = new HtmlScraper({
      timeoutMs: env.extraction.scrapeTimeoutMs,
      maxContentBytes: env.extraction.contentMaxBytes,
    });

    const classifier = new ContentClassifierService(openaiKey, env.extraction.llmModel);

    const jobService = new ExtractionJobService(
      { scraper, classifier, contentRepo, artworkRepo, museumRepo },
      {
        confidenceThreshold: env.extraction.confidenceThreshold,
        reviewThreshold: env.extraction.reviewThreshold,
        refetchAfterDays: env.extraction.refetchAfterDays,
      },
    );

    const worker = new ExtractionWorker(jobService, {
      concurrency: env.extraction.queueConcurrency,
      rateLimitMax: env.extraction.queueRateLimit,
      connection: {
        host: env.redis.host,
        port: env.redis.port,
        password: env.redis.password,
        // BullMQ Worker REQUIRES this to be null (https://docs.bullmq.io/guide/connections).
        maxRetriesPerRequest: null,
        // Circuit-breaker: fail fast when Redis is down instead of buffering commands
        // and paying 20x retries per chat message.
        enableOfflineQueue: false,
      },
    });

    worker.start();
    logger.info('knowledge_extraction_started', {
      llmModel: env.extraction.llmModel,
      concurrency: env.extraction.queueConcurrency,
    });

    return { dbLookup, extractionQueue: worker, close: () => worker.close() };
  }
}
