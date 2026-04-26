import { createE2EHarness, type E2EHarness } from 'tests/helpers/e2e/e2e-app-harness';

import { ArtworkKnowledge } from '@modules/knowledge-extraction/domain/artwork-knowledge.entity';
import {
  ExtractedContent,
  ExtractedContentStatus,
} from '@modules/knowledge-extraction/domain/extracted-content.entity';
import { MuseumEnrichment } from '@modules/knowledge-extraction/domain/museum-enrichment.entity';
import { TypeOrmArtworkKnowledgeRepo } from '@modules/knowledge-extraction/adapters/secondary/typeorm-artwork-knowledge.repo';
import { TypeOrmExtractedContentRepo } from '@modules/knowledge-extraction/adapters/secondary/typeorm-extracted-content.repo';
import { TypeOrmMuseumEnrichmentRepo } from '@modules/knowledge-extraction/adapters/secondary/typeorm-museum-enrichment.repo';
import { ExtractionJobService } from '@modules/knowledge-extraction/useCase/extraction-job.service';

import type { ContentClassifierPort } from '@modules/knowledge-extraction/domain/ports/content-classifier.port';
import type { ScraperPort } from '@modules/knowledge-extraction/domain/ports/scraper.port';

const shouldRunE2E = process.env.RUN_E2E === 'true';
const describeE2E = shouldRunE2E ? describe : describe.skip;

/**
 * Golden Path 9 — Knowledge Extraction pipeline (full DB round-trip).
 *
 * Covers the P1 audit gap (2026-04-24 enterprise audit): unit tests exercised
 * the extraction service with mocked repos; no test wired real TypeORM repos
 * against Postgres. This test:
 *   1. Boots the E2E harness (Postgres testcontainer + all migrations).
 *   2. Builds the ExtractionJobService with real TypeORM repos.
 *   3. Stubs only the external I/O ports (scraper + classifier) — everything
 *      downstream from the classifier is real.
 *   4. Invokes the pipeline and asserts: extracted_content row + artwork_knowledge
 *      row persisted with the correct shape.
 *
 * BullMQ + Redis are NOT part of the pipeline business logic; they are a
 * delivery mechanism. Exercising ExtractionJobService.processUrl() directly
 * covers every data path the worker would exercise.
 */
describeE2E('golden path 9 — knowledge extraction full pipeline', () => {
  jest.setTimeout(180_000);

  let harness: E2EHarness;

  beforeAll(async () => {
    harness = await createE2EHarness();
  });

  afterAll(async () => {
    await harness?.stop();
  });

  // Each test seeds its own fixtures; truncate beforehand so any stray rows
  // (e.g. from a prior failing run that connected to a non-ephemeral DB) do
  // not poison the dedup check at the top of `processUrl`.
  beforeEach(async () => {
    await harness.dataSource.query(
      'TRUNCATE TABLE extracted_content, artwork_knowledge, museum_enrichment RESTART IDENTITY CASCADE',
    );
  });

  const TEST_URL = 'https://example.com/mona-lisa';
  const TEST_SEARCH_TERM = 'Mona Lisa';
  const TEST_LOCALE = 'en';

  it('scrapes → classifies → persists artwork_knowledge + extracted_content rows', async () => {
    const scraperMock: ScraperPort = {
      scrape: jest.fn().mockResolvedValue({
        url: TEST_URL,
        title: 'Mona Lisa — Louvre',
        textContent: 'The Mona Lisa is a Renaissance portrait by Leonardo da Vinci.',
        contentHash: 'e2e-hash-monalisa',
      }),
    };

    const classifierMock: ContentClassifierPort = {
      classify: jest.fn().mockResolvedValue({
        type: 'artwork',
        confidence: 0.95,
        data: {
          title: 'Mona Lisa',
          artist: 'Leonardo da Vinci',
          period: 'Renaissance',
          technique: 'Oil on poplar panel',
          description: 'Portrait of a woman with an enigmatic smile.',
          historicalContext: 'Painted in the early 16th century.',
          dimensions: '77 cm × 53 cm',
          currentLocation: 'Louvre Museum, Paris',
        },
      }),
    };

    const artworkRepo = new TypeOrmArtworkKnowledgeRepo(
      harness.dataSource.getRepository(ArtworkKnowledge),
    );
    const contentRepo = new TypeOrmExtractedContentRepo(
      harness.dataSource.getRepository(ExtractedContent),
    );
    const museumRepo = new TypeOrmMuseumEnrichmentRepo(
      harness.dataSource.getRepository(MuseumEnrichment),
    );

    const service = new ExtractionJobService(
      {
        scraper: scraperMock,
        classifier: classifierMock,
        contentRepo,
        artworkRepo,
        museumRepo,
      },
      {
        confidenceThreshold: 0.8,
        reviewThreshold: 0.5,
        refetchAfterDays: 7,
      },
    );

    await service.processUrl(TEST_URL, TEST_SEARCH_TERM, TEST_LOCALE);

    expect(scraperMock.scrape).toHaveBeenCalledTimes(1);
    expect(classifierMock.classify).toHaveBeenCalledTimes(1);

    const persistedContent = await contentRepo.findByUrl(TEST_URL);
    expect(persistedContent).not.toBeNull();
    expect(persistedContent?.contentHash).toBe('e2e-hash-monalisa');
    expect(persistedContent?.status).toBe(ExtractedContentStatus.CLASSIFIED);

    const persistedArtwork = await artworkRepo.findByTitleAndLocale('Mona Lisa', TEST_LOCALE);
    expect(persistedArtwork).not.toBeNull();
    expect(persistedArtwork?.artist).toBe('Leonardo da Vinci');
    expect(persistedArtwork?.period).toBe('Renaissance');
    expect(persistedArtwork?.needsReview).toBe(false);
  });

  it('dedups repeat URL within refetchAfterDays and skips scraping', async () => {
    // Self-contained: seed an extracted_content row directly via the repo
    // instead of relying on the previous test's side effect. Avoids
    // order-dependent failures (Fix #5 from 2026-04-25 code review).
    const dedupUrl = 'https://example.com/dedup-test';
    const contentRepo = new TypeOrmExtractedContentRepo(
      harness.dataSource.getRepository(ExtractedContent),
    );
    await contentRepo.upsert({
      url: dedupUrl,
      title: 'Seeded',
      textContent: 'Seeded content',
      contentHash: 'dedup-seed-hash',
      status: ExtractedContentStatus.CLASSIFIED,
    });

    const scraperMock: ScraperPort = { scrape: jest.fn() };
    const classifierMock: ContentClassifierPort = { classify: jest.fn() };

    const artworkRepo = new TypeOrmArtworkKnowledgeRepo(
      harness.dataSource.getRepository(ArtworkKnowledge),
    );
    const museumRepo = new TypeOrmMuseumEnrichmentRepo(
      harness.dataSource.getRepository(MuseumEnrichment),
    );

    const service = new ExtractionJobService(
      {
        scraper: scraperMock,
        classifier: classifierMock,
        contentRepo,
        artworkRepo,
        museumRepo,
      },
      {
        confidenceThreshold: 0.8,
        reviewThreshold: 0.5,
        refetchAfterDays: 7,
      },
    );

    await service.processUrl(dedupUrl, TEST_SEARCH_TERM, TEST_LOCALE);

    expect(scraperMock.scrape).not.toHaveBeenCalled();
    expect(classifierMock.classify).not.toHaveBeenCalled();
  });
});
