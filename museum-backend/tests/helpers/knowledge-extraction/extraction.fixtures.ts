import {
  ExtractedContent,
  ExtractedContentStatus,
} from '@modules/knowledge-extraction/domain/extracted-content.entity';
import { ArtworkKnowledge } from '@modules/knowledge-extraction/domain/artwork-knowledge.entity';
import { MuseumEnrichment } from '@modules/knowledge-extraction/domain/museum-enrichment.entity';

import type { TypeOrmExtractedContentRepo } from '@modules/knowledge-extraction/adapters/secondary/typeorm-extracted-content.repo';
import type { TypeOrmArtworkKnowledgeRepo } from '@modules/knowledge-extraction/adapters/secondary/typeorm-artwork-knowledge.repo';
import type { TypeOrmMuseumEnrichmentRepo } from '@modules/knowledge-extraction/adapters/secondary/typeorm-museum-enrichment.repo';

export function makeExtractedContent(overrides?: Partial<ExtractedContent>): ExtractedContent {
  const content = new ExtractedContent();
  content.id = overrides?.id ?? '00000000-0000-0000-0000-000000000001';
  content.url = overrides?.url ?? 'https://example.com/test-page';
  content.title = overrides?.title ?? 'Test Page Title';
  content.textContent = overrides?.textContent ?? 'This is the extracted text content of the page.';
  content.scrapedAt = overrides?.scrapedAt ?? new Date('2026-04-10T12:00:00Z');
  content.contentHash = overrides?.contentHash ?? 'abc123hash';
  content.status = overrides?.status ?? ExtractedContentStatus.SCRAPED;
  return content;
}

export function makeArtworkKnowledge(overrides?: Partial<ArtworkKnowledge>): ArtworkKnowledge {
  const artwork = new ArtworkKnowledge();
  artwork.id = overrides?.id ?? '00000000-0000-0000-0000-000000000002';
  artwork.title = overrides?.title ?? 'Mona Lisa';
  artwork.artist = overrides?.artist ?? 'Leonardo da Vinci';
  artwork.period = overrides?.period ?? 'Renaissance';
  artwork.technique = overrides?.technique ?? 'Oil on poplar panel';
  artwork.description = overrides?.description ?? 'A half-length portrait painting.';
  artwork.historicalContext = overrides?.historicalContext ?? null;
  artwork.dimensions = overrides?.dimensions ?? '77 cm × 53 cm';
  artwork.currentLocation = overrides?.currentLocation ?? 'Louvre Museum, Room 711';
  artwork.sourceUrls = overrides?.sourceUrls ?? ['https://example.com/mona-lisa'];
  artwork.confidence = overrides?.confidence ?? 0.85;
  artwork.needsReview = overrides?.needsReview ?? false;
  artwork.locale = overrides?.locale ?? 'en';
  artwork.createdAt = overrides?.createdAt ?? new Date('2026-04-10T12:00:00Z');
  artwork.updatedAt = overrides?.updatedAt ?? new Date('2026-04-10T12:00:00Z');
  return artwork;
}

// ── Repository mock factories ──────────────────────────────────────────────

type ContentRepoStubs = {
  findByUrl?: jest.Mock;
  upsert?: jest.Mock;
  updateStatus?: jest.Mock;
};
type ArtworkRepoStubs = {
  upsertFromClassification?: jest.Mock;
  findByTitleAndLocale?: jest.Mock;
  searchByTitle?: jest.Mock;
  findNeedsReview?: jest.Mock;
  approve?: jest.Mock;
};
type MuseumRepoStubs = {
  upsertFromClassification?: jest.Mock;
  findByNameAndLocale?: jest.Mock;
  searchByName?: jest.Mock;
};

/** Mock TypeOrmExtractedContentRepo with jest-spyable methods. */
export function makeMockExtractedContentRepo(
  overrides: ContentRepoStubs = {},
): jest.Mocked<TypeOrmExtractedContentRepo> {
  const mock = {
    findByUrl: jest.fn().mockResolvedValue(null),
    upsert: jest.fn().mockResolvedValue(undefined),
    updateStatus: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  return mock as unknown as jest.Mocked<TypeOrmExtractedContentRepo>;
}

/** Mock TypeOrmArtworkKnowledgeRepo with jest-spyable methods. */
export function makeMockArtworkKnowledgeRepo(
  overrides: ArtworkRepoStubs = {},
): jest.Mocked<TypeOrmArtworkKnowledgeRepo> {
  const mock = {
    upsertFromClassification: jest.fn().mockResolvedValue(undefined),
    findByTitleAndLocale: jest.fn().mockResolvedValue(null),
    searchByTitle: jest.fn().mockResolvedValue([]),
    findNeedsReview: jest.fn().mockResolvedValue([]),
    approve: jest.fn().mockResolvedValue(null),
    ...overrides,
  };
  return mock as unknown as jest.Mocked<TypeOrmArtworkKnowledgeRepo>;
}

/** Mock TypeOrmMuseumEnrichmentRepo with jest-spyable methods. */
export function makeMockMuseumEnrichmentRepo(
  overrides: MuseumRepoStubs = {},
): jest.Mocked<TypeOrmMuseumEnrichmentRepo> {
  const mock = {
    upsertFromClassification: jest.fn().mockResolvedValue(undefined),
    findByNameAndLocale: jest.fn().mockResolvedValue(null),
    searchByName: jest.fn().mockResolvedValue([]),
    ...overrides,
  };
  return mock as unknown as jest.Mocked<TypeOrmMuseumEnrichmentRepo>;
}

export function makeMuseumEnrichment(overrides?: Partial<MuseumEnrichment>): MuseumEnrichment {
  const museum = new MuseumEnrichment();
  museum.id = overrides?.id ?? '00000000-0000-0000-0000-000000000003';
  museum.museumId = overrides?.museumId ?? null;
  museum.name = overrides?.name ?? 'Louvre Museum';
  museum.openingHours = overrides?.openingHours ?? null;
  museum.admissionFees = overrides?.admissionFees ?? null;
  museum.website = overrides?.website ?? 'https://www.louvre.fr';
  museum.collections = overrides?.collections ?? null;
  museum.currentExhibitions = overrides?.currentExhibitions ?? null;
  museum.accessibility = overrides?.accessibility ?? null;
  museum.sourceUrls = overrides?.sourceUrls ?? ['https://example.com/louvre'];
  museum.confidence = overrides?.confidence ?? 0.9;
  museum.needsReview = overrides?.needsReview ?? false;
  museum.locale = overrides?.locale ?? 'en';
  museum.createdAt = overrides?.createdAt ?? new Date('2026-04-10T12:00:00Z');
  museum.updatedAt = overrides?.updatedAt ?? new Date('2026-04-10T12:00:00Z');
  return museum;
}
