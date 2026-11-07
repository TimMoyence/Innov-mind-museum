import { InMemoryCacheService } from '../../helpers/cache/inMemoryCacheService';

import { WikidataBreakerClient } from '@modules/chat/adapters/secondary/search/wikidata-breaker';
import { WikidataTransientError } from '@modules/chat/adapters/secondary/search/wikidata.client';
import { KnowledgeBaseService } from '@modules/chat/useCase/knowledge/knowledge-base.service';

import type { WikidataClient } from '@modules/chat/adapters/secondary/search/wikidata.client';
import type {
  ArtworkFacts,
  KnowledgeBaseQuery,
} from '@modules/chat/domain/ports/knowledge-base.port';

jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const MONA: ArtworkFacts = { qid: 'Q12418', title: 'Mona Lisa' };

function makeKnowledgeBase(
  lookupOrThrow: jest.Mock<Promise<ArtworkFacts | null>, [KnowledgeBaseQuery]>,
) {
  const breaker = new WikidataBreakerClient({ lookupOrThrow } as unknown as WikidataClient, {
    timeoutMs: 5000,
    errorThresholdPercentage: 50,
    resetTimeoutMs: 30_000,
    volumeThreshold: 5,
    capacity: 5,
  });
  const service = new KnowledgeBaseService(
    breaker,
    {
      timeoutMs: 1000,
      cacheTtlSeconds: 3600,
      cacheMaxEntries: 100,
      localDumpFallbackAfterMs: 60_000,
    },
    new InMemoryCacheService(),
  );
  return { service, breaker };
}

describe('KnowledgeBaseService — une panne de Wikidata ne se garde pas en cache', () => {
  it('PANNE-CACHE · après un 504 de Wikidata, la question suivante sur le même terme retrouve les faits', async () => {
    const lookupOrThrow = jest
      .fn<Promise<ArtworkFacts | null>, [KnowledgeBaseQuery]>()
      .mockRejectedValueOnce(new WikidataTransientError(new Error('504'), 'search'))
      .mockResolvedValue(MONA);
    const { service, breaker } = makeKnowledgeBase(lookupOrThrow);

    await expect(service.lookupFacts('Mona Lisa')).resolves.toBeNull();
    await expect(service.lookupFacts('Mona Lisa')).resolves.toEqual(MONA);
    expect(lookupOrThrow).toHaveBeenCalledTimes(2);
    breaker.dispose();
  });

  it('PANNE-CACHE · une vraie absence reste en cache : Wikidata n’est interrogé qu’une fois', async () => {
    const lookupOrThrow = jest
      .fn<Promise<ArtworkFacts | null>, [KnowledgeBaseQuery]>()
      .mockResolvedValue(null);
    const { service, breaker } = makeKnowledgeBase(lookupOrThrow);

    await expect(service.lookupFacts('chaise de bureau')).resolves.toBeNull();
    await expect(service.lookupFacts('chaise de bureau')).resolves.toBeNull();
    expect(lookupOrThrow).toHaveBeenCalledTimes(1);
    breaker.dispose();
  });
});
