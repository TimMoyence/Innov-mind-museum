import { UserMemoryService } from '@modules/chat/useCase/user-memory.service';
import { makeUserMemoryRepoStub } from '../../helpers/chat/userMemory.fixtures';

import type { ArtworkKnowledgeRepoPort } from '@modules/knowledge-extraction/domain/ports/artwork-knowledge-repo.port';
import type { ArtworkKnowledge } from '@modules/knowledge-extraction/domain/artwork-knowledge.entity';

const makeArtworkRepoStub = (
  byTitle: Record<string, Partial<ArtworkKnowledge>>,
): ArtworkKnowledgeRepoPort => ({
  findByTitleAndLocale: async (title) => (byTitle[title] as ArtworkKnowledge) ?? null,
  searchByTitle: async () => [],
  upsertFromClassification: async (data) => data as ArtworkKnowledge,
  findNeedsReview: async () => [],
  approve: async () => null,
});

describe('UserMemoryService.mergePeriods (Spec C)', () => {
  it('writes new periods from discussed artworks, deduped case-insensitively', async () => {
    const repo = makeUserMemoryRepoStub({ favoritePeriods: ['Renaissance'] });
    const artworkRepo = makeArtworkRepoStub({
      'Mona Lisa': { period: 'Renaissance' },
      'Impression, soleil levant': { period: 'Impressionism' },
    });
    const svc = new UserMemoryService(repo, undefined, { artworkRepo });

    await svc.updateAfterSession(
      1,
      {
        museumName: 'Louvre',
        museumConfidence: 0.9,
        artworksDiscussed: [
          { title: 'Mona Lisa', messageId: 'm1', discussedAt: '2026-05-02T10:00:00Z' },
          {
            title: 'Impression, soleil levant',
            messageId: 'm2',
            discussedAt: '2026-05-02T10:01:00Z',
          },
        ],
        roomsVisited: [],
        detectedExpertise: 'beginner',
        expertiseSignals: 0,
        lastUpdated: '2026-05-02T10:01:00Z',
      },
      'sess-1',
      'fr',
    );

    expect(repo.upsertCalls[0][1].favoritePeriods).toEqual(['Renaissance', 'Impressionism']);
  });

  it('caps at MAX_PERIODS=10 keeping the most recent', async () => {
    const existing = Array.from({ length: 10 }, (_, i) => `Period${String(i)}`);
    const repo = makeUserMemoryRepoStub({ favoritePeriods: existing });
    const artworkRepo = makeArtworkRepoStub({ NewArt: { period: 'Brand New' } });
    const svc = new UserMemoryService(repo, undefined, { artworkRepo });

    await svc.updateAfterSession(
      1,
      {
        museumName: 'X',
        museumConfidence: 1,
        roomsVisited: [],
        detectedExpertise: 'beginner',
        expertiseSignals: 0,
        lastUpdated: '2026-05-02T10:00:00Z',
        artworksDiscussed: [
          { title: 'NewArt', messageId: 'm1', discussedAt: '2026-05-02T10:00:00Z' },
        ],
      },
      'sess-1',
      'fr',
    );

    expect(repo.upsertCalls[0][1].favoritePeriods).toHaveLength(10);
    expect(repo.upsertCalls[0][1].favoritePeriods?.[9]).toBe('Brand New');
    expect(repo.upsertCalls[0][1].favoritePeriods).not.toContain('Period0');
  });

  it('skips writing when no new period is found', async () => {
    const repo = makeUserMemoryRepoStub({ favoritePeriods: ['Renaissance'] });
    const artworkRepo = makeArtworkRepoStub({}); // every lookup returns null
    const svc = new UserMemoryService(repo, undefined, { artworkRepo });

    await svc.updateAfterSession(
      1,
      {
        museumName: 'X',
        museumConfidence: 1,
        roomsVisited: [],
        detectedExpertise: 'beginner',
        expertiseSignals: 0,
        lastUpdated: '2026-05-02T10:00:00Z',
        artworksDiscussed: [
          { title: 'Unknown', messageId: 'm1', discussedAt: '2026-05-02T10:00:00Z' },
        ],
      },
      'sess-1',
      'fr',
    );

    expect(repo.upsertCalls[0][1].favoritePeriods).toBeUndefined();
  });
});
