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
      return { scrapedAt: new Date() };
    }),
  });
}

const makeArtworkRepo = () => makeMockArtworkKnowledgeRepo();
const makeMuseumRepo = () => makeMockMuseumEnrichmentRepo();

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

    await service.processUrl(URL_A, 'en');
    expect(contentRepo.upsert).toHaveBeenCalledTimes(1);
    expect(contentRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ url: URL_A, status: ExtractedContentStatus.SCRAPED }),
    );

    await service.processUrl(URL_A, 'en');

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

    await service.processUrl(URL_A, 'en');

    expect(contentRepo.upsert).toHaveBeenCalledTimes(1);
    expect(artworkRepo.upsertFromClassification).toHaveBeenCalledTimes(1);
  });

  it('is safe to call concurrently — findByUrl is the guard (no double-write)', async () => {
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

    await Promise.all([service.processUrl(URL_A, 'en'), service.processUrl(URL_A, 'en')]);

    expect(contentRepo.upsert).toHaveBeenCalledTimes(2);
  });
});
