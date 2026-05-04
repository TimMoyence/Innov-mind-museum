jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { buildLocalKnowledgeBlock } from '@modules/knowledge-extraction/useCase/lookup/db-lookup.prompt';
import { DbLookupService } from '@modules/knowledge-extraction/useCase/lookup/db-lookup.service';
import {
  makeArtworkKnowledge,
  makeMuseumEnrichment,
} from '../../helpers/knowledge-extraction/extraction.fixtures';
import type { TypeOrmArtworkKnowledgeRepo } from '@modules/knowledge-extraction/adapters/secondary/pg/typeorm-artwork-knowledge.repo';
import type { TypeOrmMuseumEnrichmentRepo } from '@modules/knowledge-extraction/adapters/secondary/pg/typeorm-museum-enrichment.repo';

function makeMockArtworkRepo(
  results: Awaited<ReturnType<TypeOrmArtworkKnowledgeRepo['searchByTitle']>>,
): Pick<TypeOrmArtworkKnowledgeRepo, 'searchByTitle'> {
  return { searchByTitle: jest.fn().mockResolvedValue(results) };
}

function makeMockMuseumRepo(
  results: Awaited<ReturnType<TypeOrmMuseumEnrichmentRepo['searchByName']>>,
): Pick<TypeOrmMuseumEnrichmentRepo, 'searchByName'> {
  return { searchByName: jest.fn().mockResolvedValue(results) };
}

// ─── buildLocalKnowledgeBlock ───────────────────────────────────────────────

describe('buildLocalKnowledgeBlock', () => {
  it('returns empty string when both arrays are empty', () => {
    expect(buildLocalKnowledgeBlock([], [])).toBe('');
  });

  it('contains header and artwork data when artwork found', () => {
    const art = makeArtworkKnowledge({
      title: 'Starry Night',
      artist: 'Vincent van Gogh',
      period: 'Post-Impressionism',
      technique: 'Oil on canvas',
      description: 'A swirling night sky over a village.',
      historicalContext: 'Painted in 1889 at Saint-Paul-de-Mausole asylum.',
      dimensions: '73.7 cm × 92.1 cm',
      currentLocation: 'MoMA, New York',
    });

    const block = buildLocalKnowledgeBlock([art], []);

    expect(block).toContain('[LOCAL KNOWLEDGE');
    expect(block).toContain('Starry Night');
    expect(block).toContain('Vincent van Gogh');
    expect(block).toContain('Post-Impressionism');
    expect(block).toContain('Oil on canvas');
    expect(block).toContain('73.7 cm');
    expect(block).toContain('MoMA, New York');
    expect(block).toContain('Painted in 1889');
    expect(block).toContain('Prioritize this verified data');
  });

  it('contains header and museum data when museum found', () => {
    const museum = makeMuseumEnrichment({
      name: "Musée d'Orsay",
      website: 'https://www.musee-orsay.fr',
      openingHours: { tuesday: '9h30-18h', thursday: '9h30-21h45' },
      admissionFees: { adult: 16, reduced: 13 },
      collections: { paintings: true, sculptures: true },
    });

    const block = buildLocalKnowledgeBlock([], [museum]);

    expect(block).toContain('[LOCAL KNOWLEDGE');
    expect(block).toContain("Musée d'Orsay");
    expect(block).toContain('https://www.musee-orsay.fr');
    expect(block).toContain('tuesday');
    expect(block).toContain('adult');
    expect(block).toContain('paintings');
    expect(block).toContain('Prioritize this verified data');
  });

  it('omits optional artwork fields when they are null', () => {
    // Build directly — factory uses ?? so null overrides fall through to defaults
    const art = makeArtworkKnowledge({ title: 'Untitled', description: 'Plain artwork.' });
    art.artist = null;
    art.period = null;
    art.technique = null;
    art.dimensions = null;
    art.currentLocation = null;
    art.historicalContext = null;

    const block = buildLocalKnowledgeBlock([art], []);

    expect(block).toContain('[LOCAL KNOWLEDGE');
    expect(block).not.toContain('Artist:');
    expect(block).not.toContain('Period:');
    expect(block).not.toContain('Technique:');
    expect(block).not.toContain('Dimensions:');
    expect(block).not.toContain('Location:');
    expect(block).not.toContain('Context:');
  });

  it('omits optional museum fields when they are null', () => {
    // Build directly — factory uses ?? so null overrides fall through to defaults
    const museum = makeMuseumEnrichment({ name: 'Minimal Museum' });
    museum.website = null;
    museum.openingHours = null;
    museum.admissionFees = null;
    museum.collections = null;

    const block = buildLocalKnowledgeBlock([], [museum]);

    expect(block).toContain('[LOCAL KNOWLEDGE');
    expect(block).not.toContain('Website:');
    expect(block).not.toContain('Hours:');
    expect(block).not.toContain('Fees:');
    expect(block).not.toContain('Collections:');
  });

  it('caps output at MAX_BLOCK_LENGTH and appends ellipsis', () => {
    // Each artwork contributes: header (~10) + title line (~20) + artist (~20) +
    // description (capped at 400) + context (capped at 300) + other fields (~100) ≈ 850 chars.
    // Three artworks exceed 1500, triggering the truncation path.
    const artworks = Array.from({ length: 3 }, (_, i) => {
      const art = makeArtworkKnowledge({
        id: `00000000-0000-0000-0000-00000000000${String(i + 1)}`,
        title: `Artwork Title Number ${String(i + 1)}`,
        description: 'D'.repeat(400),
      });
      art.historicalContext = 'H'.repeat(300);
      return art;
    });

    const block = buildLocalKnowledgeBlock(artworks, []);

    expect(block.length).toBe(1500);
    expect(block.endsWith('...')).toBe(true);
  });

  it('limits artwork entries to 3 and museum entries to 2', () => {
    const artworks = Array.from({ length: 5 }, (_, i) =>
      makeArtworkKnowledge({
        title: `Artwork ${String(i + 1)}`,
        id: `00000000-0000-0000-0000-00000000000${String(i + 1)}`,
      }),
    );
    const museums = Array.from({ length: 4 }, (_, i) =>
      makeMuseumEnrichment({
        name: `Museum ${String(i + 1)}`,
        id: `00000000-0000-0000-0000-10000000000${String(i + 1)}`,
      }),
    );

    const block = buildLocalKnowledgeBlock(artworks, museums);

    expect(block).toContain('Artwork 1');
    expect(block).toContain('Artwork 3');
    expect(block).not.toContain('Artwork 4');
    expect(block).toContain('Museum 1');
    expect(block).toContain('Museum 2');
    expect(block).not.toContain('Museum 3');
  });
});

// ─── DbLookupService ─────────────────────────────────────────────────────────

describe('DbLookupService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns formatted block when artwork is found', async () => {
    const art = makeArtworkKnowledge({ title: 'Mona Lisa', artist: 'Leonardo da Vinci' });
    const service = new DbLookupService(
      makeMockArtworkRepo([art]) as TypeOrmArtworkKnowledgeRepo,
      makeMockMuseumRepo([]) as TypeOrmMuseumEnrichmentRepo,
    );

    const result = await service.lookup('Mona Lisa', 'en');

    expect(result).toContain('[LOCAL KNOWLEDGE');
    expect(result).toContain('Mona Lisa');
    expect(result).toContain('Leonardo da Vinci');
  });

  it('returns formatted block when museum is found', async () => {
    const museum = makeMuseumEnrichment({ name: 'Louvre Museum' });
    const service = new DbLookupService(
      makeMockArtworkRepo([]) as TypeOrmArtworkKnowledgeRepo,
      makeMockMuseumRepo([museum]) as TypeOrmMuseumEnrichmentRepo,
    );

    const result = await service.lookup('Louvre', 'en');

    expect(result).toContain('[LOCAL KNOWLEDGE');
    expect(result).toContain('Louvre Museum');
  });

  it('returns empty string when nothing is found', async () => {
    const service = new DbLookupService(
      makeMockArtworkRepo([]) as TypeOrmArtworkKnowledgeRepo,
      makeMockMuseumRepo([]) as TypeOrmMuseumEnrichmentRepo,
    );

    const result = await service.lookup('unknown query', 'en');

    expect(result).toBe('');
  });

  it('returns empty string for blank search term without querying repos', async () => {
    const artworkRepo = makeMockArtworkRepo([]) as TypeOrmArtworkKnowledgeRepo;
    const museumRepo = makeMockMuseumRepo([]) as TypeOrmMuseumEnrichmentRepo;
    const service = new DbLookupService(artworkRepo, museumRepo);

    const result = await service.lookup('   ', 'en');

    expect(result).toBe('');
    expect(artworkRepo.searchByTitle).not.toHaveBeenCalled();
    expect(museumRepo.searchByName).not.toHaveBeenCalled();
  });

  it('returns empty string and does not throw when repo throws (fail-open)', async () => {
    const artworkRepo = {
      searchByTitle: jest.fn().mockRejectedValue(new Error('DB connection lost')),
    } as unknown as TypeOrmArtworkKnowledgeRepo;
    const museumRepo = makeMockMuseumRepo([]) as TypeOrmMuseumEnrichmentRepo;
    const service = new DbLookupService(artworkRepo, museumRepo);

    const result = await service.lookup('Mona Lisa', 'en');

    expect(result).toBe('');
  });
});
