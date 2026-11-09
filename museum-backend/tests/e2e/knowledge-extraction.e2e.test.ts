import { createE2EHarness, type E2EHarness } from 'tests/helpers/e2e/e2e-app-harness';

import { ArtworkKnowledge } from '@modules/knowledge-extraction/domain/artwork-knowledge/artwork-knowledge.entity';
import {
  ExtractedContent,
  ExtractedContentStatus,
} from '@modules/knowledge-extraction/domain/extracted-content/extracted-content.entity';
import { MuseumEnrichment } from '@modules/knowledge-extraction/domain/museum-enrichment/museum-enrichment.entity';
import { TypeOrmArtworkKnowledgeRepo } from '@modules/knowledge-extraction/adapters/secondary/pg/typeorm-artwork-knowledge.repo';
import { TypeOrmExtractedContentRepo } from '@modules/knowledge-extraction/adapters/secondary/pg/typeorm-extracted-content.repo';
import { TypeOrmMuseumEnrichmentRepo } from '@modules/knowledge-extraction/adapters/secondary/pg/typeorm-museum-enrichment.repo';
import { ExtractionJobService } from '@modules/knowledge-extraction/useCase/extraction/extraction-job.service';

import type { ContentClassifierPort } from '@modules/knowledge-extraction/domain/ports/content-classifier.port';
import type { ScraperPort } from '@modules/knowledge-extraction/domain/ports/scraper.port';

const shouldRunE2E = process.env.RUN_E2E === 'true';
const describeE2E = shouldRunE2E ? describe : describe.skip;

describeE2E('golden path 9 — knowledge extraction full pipeline', () => {
  let harness: E2EHarness;

  beforeAll(async () => {
    harness = await createE2EHarness();
  });

  afterAll(async () => {
    await harness?.stop();
  });

  const TEST_URL = 'https://example.com/mona-lisa';
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

    await service.processUrl(TEST_URL, TEST_LOCALE);

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

    await service.processUrl(dedupUrl, TEST_LOCALE);

    expect(scraperMock.scrape).not.toHaveBeenCalled();
    expect(classifierMock.classify).not.toHaveBeenCalled();
  });
});
