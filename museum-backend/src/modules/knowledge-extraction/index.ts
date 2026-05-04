import { ExtractionWorker } from '@modules/knowledge-extraction/adapters/primary/extraction.worker';
import { TypeOrmArtworkKnowledgeRepo } from '@modules/knowledge-extraction/adapters/secondary/pg/typeorm-artwork-knowledge.repo';
import { TypeOrmExtractedContentRepo } from '@modules/knowledge-extraction/adapters/secondary/pg/typeorm-extracted-content.repo';
import { TypeOrmMuseumEnrichmentRepo } from '@modules/knowledge-extraction/adapters/secondary/pg/typeorm-museum-enrichment.repo';
import { HtmlScraper } from '@modules/knowledge-extraction/adapters/secondary/scraper/html-scraper';
import { ArtworkKnowledge } from '@modules/knowledge-extraction/domain/artwork-knowledge/artwork-knowledge.entity';
import { ExtractedContent } from '@modules/knowledge-extraction/domain/extracted-content/extracted-content.entity';
import { MuseumEnrichment } from '@modules/knowledge-extraction/domain/museum-enrichment/museum-enrichment.entity';
import { ContentClassifierService } from '@modules/knowledge-extraction/useCase/classification/content-classifier.service';
import { ExtractionJobService } from '@modules/knowledge-extraction/useCase/extraction/extraction-job.service';
import { DbLookupService } from '@modules/knowledge-extraction/useCase/lookup/db-lookup.service';
import { logger } from '@shared/logger/logger';
import { env } from '@src/config/env';

import type { ArtworkKnowledgeRepoPort } from '@modules/knowledge-extraction/domain/ports/artwork-knowledge-repo.port';
import type { ExtractionQueuePort } from '@modules/knowledge-extraction/domain/ports/extraction-queue.port';
import type { DataSource } from 'typeorm';

/** Built module output -- consumed by ChatModule and admin routes. */
export interface BuiltKnowledgeExtractionModule {
  dbLookup: DbLookupService;
  extractionQueue?: ExtractionQueuePort;
  artworkKnowledgeRepo: ArtworkKnowledgeRepoPort;
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

    // EXTRACTION_WORKER_ENABLED=false short-circuits BEFORE any BullMQ / Redis
    // wiring so test environments without Redis don't open ioredis clients.
    // Chat module degrades to db-lookup-only — same shape as the missing-key path.
    if (!env.extractionWorkerEnabled) {
      logger.info('knowledge_extraction_disabled', { reason: 'extraction_worker_flag_off' });
      return { dbLookup, artworkKnowledgeRepo: artworkRepo, close: () => Promise.resolve() };
    }

    const openaiKey = env.llm.openAiApiKey;
    if (!openaiKey) {
      logger.warn('knowledge_extraction_no_openai_key', {
        reason:
          'OPENAI_API_KEY required for content classification — pipeline degraded to db-lookup only',
      });
      return { dbLookup, artworkKnowledgeRepo: artworkRepo, close: () => Promise.resolve() };
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

    return {
      dbLookup,
      extractionQueue: worker,
      artworkKnowledgeRepo: artworkRepo,
      close: () => worker.close(),
    };
  }
}
