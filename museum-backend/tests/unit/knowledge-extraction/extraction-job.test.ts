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
  ClassifiedArtworkData,
  ClassifiedMuseumData,
} from '@modules/knowledge-extraction/domain/ports/content-classifier.port';
import type { TypeOrmExtractedContentRepo } from '@modules/knowledge-extraction/adapters/secondary/pg/typeorm-extracted-content.repo';
import type { TypeOrmArtworkKnowledgeRepo } from '@modules/knowledge-extraction/adapters/secondary/pg/typeorm-artwork-knowledge.repo';
import type { TypeOrmMuseumEnrichmentRepo } from '@modules/knowledge-extraction/adapters/secondary/pg/typeorm-museum-enrichment.repo';
import {
  makeMockExtractedContentRepo,
  makeMockArtworkKnowledgeRepo,
  makeMockMuseumEnrichmentRepo,
} from '../../helpers/knowledge-extraction/extraction.fixtures';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TEST_URL = 'https://example.com/mona-lisa';
const TEST_SEARCH_TERM = 'Mona Lisa';
const TEST_LOCALE = 'en';

const SCRAPED_PAGE: ScrapedPage = {
  url: TEST_URL,
  title: 'Mona Lisa — Louvre',
  textContent: 'The Mona Lisa is a Renaissance portrait by Leonardo da Vinci.',
  contentHash: 'abc123def456abcd',
};

const ARTWORK_DATA: ClassifiedArtworkData = {
  title: 'Mona Lisa',
  artist: 'Leonardo da Vinci',
  period: 'Renaissance',
  technique: 'Oil on poplar panel',
  description: 'Portrait of a woman with an enigmatic smile.',
  historicalContext: 'Painted in the early 16th century.',
  dimensions: '77 cm × 53 cm',
  currentLocation: 'Louvre Museum, Paris',
};

const MUSEUM_DATA: ClassifiedMuseumData = {
  name: 'Louvre Museum',
  openingHours: { tuesday: '9h-18h' },
  admissionFees: { adult: 17 },
  website: 'https://www.louvre.fr',
  collections: { paintings: true },
  currentExhibitions: { name: 'Ancient Egypt' },
  accessibility: { wheelchair: true },
};

const ARTWORK_CLASSIFICATION: ClassificationResult = {
  type: 'artwork',
  confidence: 0.95,
  data: ARTWORK_DATA,
};

const MUSEUM_CLASSIFICATION: ClassificationResult = {
  type: 'museum',
  confidence: 0.85,
  data: MUSEUM_DATA,
};

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

const config = { confidenceThreshold: 0.7, reviewThreshold: 0.4, refetchAfterDays: 7 };

function makeScraper(result: ScrapedPage | null = SCRAPED_PAGE): jest.Mocked<ScraperPort> {
  return { scrape: jest.fn().mockResolvedValue(result) };
}

function makeClassifier(
  result: ClassificationResult | null = ARTWORK_CLASSIFICATION,
): jest.Mocked<ContentClassifierPort> {
  return { classify: jest.fn().mockResolvedValue(result) };
}

function makeContentRepo(
  existing: { scrapedAt: Date } | null = null,
): jest.Mocked<TypeOrmExtractedContentRepo> {
  return makeMockExtractedContentRepo({
    findByUrl: jest.fn().mockResolvedValue(existing),
  });
}

const makeArtworkRepo = (): jest.Mocked<TypeOrmArtworkKnowledgeRepo> =>
  makeMockArtworkKnowledgeRepo();
const makeMuseumRepo = (): jest.Mocked<TypeOrmMuseumEnrichmentRepo> =>
  makeMockMuseumEnrichmentRepo();

function makeService(overrides?: {
  scraper?: jest.Mocked<ScraperPort>;
  classifier?: jest.Mocked<ContentClassifierPort>;
  contentRepo?: jest.Mocked<TypeOrmExtractedContentRepo>;
  artworkRepo?: jest.Mocked<TypeOrmArtworkKnowledgeRepo>;
  museumRepo?: jest.Mocked<TypeOrmMuseumEnrichmentRepo>;
}) {
  const scraper = overrides?.scraper ?? makeScraper();
  const classifier = overrides?.classifier ?? makeClassifier();
  const contentRepo = overrides?.contentRepo ?? makeContentRepo();
  const artworkRepo = overrides?.artworkRepo ?? makeArtworkRepo();
  const museumRepo = overrides?.museumRepo ?? makeMuseumRepo();
  const service = new ExtractionJobService(
    { scraper, classifier, contentRepo, artworkRepo, museumRepo },
    config,
  );
  return { service, scraper, classifier, contentRepo, artworkRepo, museumRepo };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ExtractionJobService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('full success flow: scrapes, classifies artwork, stores in artworkRepo', async () => {
    const { service, scraper, classifier, contentRepo, artworkRepo, museumRepo } = makeService();

    await service.processUrl(TEST_URL, TEST_SEARCH_TERM, TEST_LOCALE);

    expect(scraper.scrape).toHaveBeenCalledWith(TEST_URL);
    expect(classifier.classify).toHaveBeenCalledWith(SCRAPED_PAGE.textContent, TEST_LOCALE);
    expect(contentRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ url: TEST_URL, status: ExtractedContentStatus.SCRAPED }),
    );
    expect(artworkRepo.upsertFromClassification).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Mona Lisa',
        confidence: 0.95,
        needsReview: false,
        locale: TEST_LOCALE,
        sourceUrls: [TEST_URL],
      }),
      TEST_URL,
    );
    expect(museumRepo.upsertFromClassification).not.toHaveBeenCalled();
    expect(contentRepo.updateStatus).toHaveBeenCalledWith(
      TEST_URL,
      ExtractedContentStatus.CLASSIFIED,
    );
  });

  it('skips recently scraped URLs (scrapedAt < 7 days ago)', async () => {
    const recentDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000); // 2 days ago
    const contentRepo = makeContentRepo({ scrapedAt: recentDate });
    const { service, scraper, classifier } = makeService({ contentRepo });

    await service.processUrl(TEST_URL, TEST_SEARCH_TERM, TEST_LOCALE);

    expect(scraper.scrape).not.toHaveBeenCalled();
    expect(classifier.classify).not.toHaveBeenCalled();
    expect(contentRepo.upsert).not.toHaveBeenCalled();
  });

  it('re-scrapes stale URLs (scrapedAt >= 7 days ago)', async () => {
    const staleDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000); // 8 days ago
    const contentRepo = makeContentRepo({ scrapedAt: staleDate });
    const { service, scraper } = makeService({ contentRepo });

    await service.processUrl(TEST_URL, TEST_SEARCH_TERM, TEST_LOCALE);

    expect(scraper.scrape).toHaveBeenCalledWith(TEST_URL);
    expect(contentRepo.upsert).toHaveBeenCalled();
  });

  it('handles scraper failure (returns null) — classifier NOT called', async () => {
    const scraper = makeScraper(null);
    const { service, classifier, contentRepo } = makeService({ scraper });

    await service.processUrl(TEST_URL, TEST_SEARCH_TERM, TEST_LOCALE);

    expect(scraper.scrape).toHaveBeenCalledWith(TEST_URL);
    expect(classifier.classify).not.toHaveBeenCalled();
    expect(contentRepo.upsert).not.toHaveBeenCalled();
    expect(contentRepo.updateStatus).not.toHaveBeenCalled();
  });

  it('handles classifier failure (returns null) — status set to FAILED', async () => {
    const classifier = makeClassifier(null);
    const { service, contentRepo, artworkRepo } = makeService({ classifier });

    await service.processUrl(TEST_URL, TEST_SEARCH_TERM, TEST_LOCALE);

    expect(contentRepo.upsert).toHaveBeenCalled();
    expect(contentRepo.updateStatus).toHaveBeenCalledWith(TEST_URL, ExtractedContentStatus.FAILED);
    expect(artworkRepo.upsertFromClassification).not.toHaveBeenCalled();
  });

  it('low confidence (< 0.4) → status LOW_CONFIDENCE, no artwork/museum stored', async () => {
    const lowConfidenceClassification: ClassificationResult = {
      type: 'artwork',
      confidence: 0.2,
      data: ARTWORK_DATA,
    };
    const classifier = makeClassifier(lowConfidenceClassification);
    const { service, contentRepo, artworkRepo, museumRepo } = makeService({ classifier });

    await service.processUrl(TEST_URL, TEST_SEARCH_TERM, TEST_LOCALE);

    expect(contentRepo.updateStatus).toHaveBeenCalledWith(
      TEST_URL,
      ExtractedContentStatus.LOW_CONFIDENCE,
    );
    expect(artworkRepo.upsertFromClassification).not.toHaveBeenCalled();
    expect(museumRepo.upsertFromClassification).not.toHaveBeenCalled();
  });

  it('needs review (0.4–0.7) → stores with needsReview=true', async () => {
    const midConfidenceClassification: ClassificationResult = {
      type: 'artwork',
      confidence: 0.55,
      data: ARTWORK_DATA,
    };
    const classifier = makeClassifier(midConfidenceClassification);
    const { service, artworkRepo, contentRepo } = makeService({ classifier });

    await service.processUrl(TEST_URL, TEST_SEARCH_TERM, TEST_LOCALE);

    expect(artworkRepo.upsertFromClassification).toHaveBeenCalledWith(
      expect.objectContaining({ needsReview: true, confidence: 0.55 }),
      TEST_URL,
    );
    expect(contentRepo.updateStatus).toHaveBeenCalledWith(
      TEST_URL,
      ExtractedContentStatus.CLASSIFIED,
    );
  });

  it('museum classification → stores in museumRepo, not artworkRepo', async () => {
    const classifier = makeClassifier(MUSEUM_CLASSIFICATION);
    const { service, artworkRepo, museumRepo, contentRepo } = makeService({ classifier });

    await service.processUrl(TEST_URL, TEST_SEARCH_TERM, TEST_LOCALE);

    expect(museumRepo.upsertFromClassification).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Louvre Museum',
        museumId: null,
        confidence: 0.85,
        needsReview: false,
        locale: TEST_LOCALE,
        sourceUrls: [TEST_URL],
      }),
      TEST_URL,
    );
    expect(artworkRepo.upsertFromClassification).not.toHaveBeenCalled();
    expect(contentRepo.updateStatus).toHaveBeenCalledWith(
      TEST_URL,
      ExtractedContentStatus.CLASSIFIED,
    );
  });
});
