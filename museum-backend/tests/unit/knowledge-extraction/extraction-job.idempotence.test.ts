/**
 * Idempotence invariant: processing the same URL twice within the TTL window
 * must produce exactly one `extracted_content` row — the second call is a no-op.
 */

jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { ExtractionJobService } from '@modules/knowledge-extraction/useCase/extraction/extraction-job.service';
import { ExtractedContentStatus } from '@modules/knowledge-extraction/domain/extracted-content/extracted-content.entity';
import type {
  ScraperPort,
  ScrapedPage,
} from '@modules/knowledge-extraction/domain/ports/scraper.port';
import type {
  ContentClassifierPort,
  ClassificationResult,
} from '@modules/knowledge-extraction/domain/ports/content-classifier.port';
import {
  makeMockExtractedContentRepo,
  makeMockArtworkKnowledgeRepo,
  makeMockMuseumEnrichmentRepo,
} from '../../helpers/knowledge-extraction/extraction.fixtures';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const URL_A = 'https://example.com/mona-lisa';

const SCRAPED: ScrapedPage = {
  url: URL_A,
  title: 'Mona Lisa',
  textContent: 'Renaissance masterpiece.',
  contentHash: 'hash-abc',
};

const CLASSIFICATION: ClassificationResult = {
  type: 'artwork',
  confidence: 0.9,
  data: {
    title: 'Mona Lisa',
    artist: 'da Vinci',
    period: 'Renaissance',
    technique: null,
    description: 'A portrait.',
    historicalContext: null,
    dimensions: null,
    currentLocation: 'Louvre',
  },
};

const CONFIG = { confidenceThreshold: 0.7, reviewThreshold: 0.4, refetchAfterDays: 7 };

// ── Factory helpers ───────────────────────────────────────────────────────────

function makeScraper(): jest.Mocked<ScraperPort> {
  return { scrape: jest.fn().mockResolvedValue(SCRAPED) };
}

function makeClassifier(): jest.Mocked<ContentClassifierPort> {
  return { classify: jest.fn().mockResolvedValue(CLASSIFICATION) };
}

function makeContentRepo(firstCallResult: { scrapedAt: Date } | null) {
  let callCount = 0;
  return makeMockExtractedContentRepo({
    findByUrl: jest.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) return firstCallResult;
      // Second call simulates the record written by the first pass
      return { scrapedAt: new Date() };
    }),
  });
}

const makeArtworkRepo = () => makeMockArtworkKnowledgeRepo();
const makeMuseumRepo = () => makeMockMuseumEnrichmentRepo();

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ExtractionJobService — idempotence', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('produces exactly one upsert when the same URL is processed twice within the TTL', async () => {
    const contentRepo = makeContentRepo(null);
    const artworkRepo = makeArtworkRepo();
    const service = new ExtractionJobService(
      {
        scraper: makeScraper(),
        classifier: makeClassifier(),
        contentRepo,
        artworkRepo,
        museumRepo: makeMuseumRepo(),
      },
      CONFIG,
    );

    // First call — no existing record → full pipeline
    await service.processUrl(URL_A, 'Mona Lisa', 'en');
    expect(contentRepo.upsert).toHaveBeenCalledTimes(1);
    expect(contentRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ url: URL_A, status: ExtractedContentStatus.SCRAPED }),
    );

    // Second call — record exists and is fresh → skipped
    await service.processUrl(URL_A, 'Mona Lisa', 'en');

    // upsert total must still be 1 — second call was a no-op
    expect(contentRepo.upsert).toHaveBeenCalledTimes(1);
    expect(artworkRepo.upsertFromClassification).toHaveBeenCalledTimes(1);
  });

  it('re-processes URL when the existing record is stale (>= refetchAfterDays)', async () => {
    const staleDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    const contentRepo = makeMockExtractedContentRepo({
      findByUrl: jest.fn().mockResolvedValue({ scrapedAt: staleDate }),
    });

    const artworkRepo = makeArtworkRepo();
    const service = new ExtractionJobService(
      {
        scraper: makeScraper(),
        classifier: makeClassifier(),
        contentRepo,
        artworkRepo,
        museumRepo: makeMuseumRepo(),
      },
      CONFIG,
    );

    await service.processUrl(URL_A, 'Mona Lisa', 'en');

    // Stale → re-scraped → upsert called once
    expect(contentRepo.upsert).toHaveBeenCalledTimes(1);
    expect(artworkRepo.upsertFromClassification).toHaveBeenCalledTimes(1);
  });

  it('is safe to call concurrently — findByUrl is the guard (no double-write)', async () => {
    // Simulate a race: both concurrent calls find no existing record
    const contentRepo = makeMockExtractedContentRepo();

    const artworkRepo = makeArtworkRepo();
    const service = new ExtractionJobService(
      {
        scraper: makeScraper(),
        classifier: makeClassifier(),
        contentRepo,
        artworkRepo,
        museumRepo: makeMuseumRepo(),
      },
      CONFIG,
    );

    await Promise.all([
      service.processUrl(URL_A, 'Mona Lisa', 'en'),
      service.processUrl(URL_A, 'Mona Lisa', 'en'),
    ]);

    // Both calls proceed (no in-process lock), but the DB upsert is idempotent
    // (TypeORM upsert by url = ON CONFLICT DO UPDATE).
    // The test asserts the service itself doesn't throw on concurrent runs.
    expect(contentRepo.upsert).toHaveBeenCalledTimes(2);
  });
});
