import { errorMessage } from '@shared/errors/error-message';
import { logger } from '@shared/logger/logger';

import type { KnowledgeBaseProvider } from '@modules/chat/domain/ports/knowledge-base.port';
import type { WikidataKbDumpRepositoryPort } from '@modules/chat/domain/ports/wikidata-kb-dump.port';

export interface SeedKbCanonDeps {
  readonly client: KnowledgeBaseProvider;
  readonly repo: WikidataKbDumpRepositoryPort;
  readonly terms: readonly string[];
  readonly languages: readonly string[];
  readonly dryRun?: boolean;
}

export interface SeedKbCanonResult {
  total: number;
  attempted: number;
  hits: number;
  upserted: number;
  errors: number;
}

export const DEFAULT_CANON_TERMS: readonly string[] = Object.freeze([
  'Mona Lisa',
  'Liberty Leading the People',
  'The Coronation of Napoleon',
  'The Raft of the Medusa',
  'The Wedding at Cana',
  'The Death of Marat',
  'The Lacemaker',
  'The Astronomer',
  'Vénus de Milo',
  'Winged Victory of Samothrace',
  'The Code of Hammurabi',
  'The Seated Scribe',
  'The Starry Night',
  'Bal du moulin de la Galette',
  'Luncheon of the Boating Party',
  'Olympia',
  'The Origin of the World',
  'A Sunday on La Grande Jatte',
  'Guernica',
  "Les Demoiselles d'Avignon",
  'The Persistence of Memory',
  'Composition VIII',
  'The Creation of Adam',
  'The Last Supper',
  'The Birth of Venus',
  'Primavera',
  'David',
  'Pietà',
  'Girl with a Pearl Earring',
  'The Night Watch',
  'The Garden of Earthly Delights',
  'Las Meninas',
  'Water Lilies',
  'Impression, Sunrise',
  'The Dance Class',
  'The Scream',
  'The Kiss',
  'The Wanderer above the Sea of Fog',
  'American Gothic',
  'The Son of Man',
  'Nighthawks',
  "Campbell's Soup Cans",
  'The Great Wave off Kanagawa',
  'Terracotta Army',
  'Bust of Nefertiti',
  'Discobolus',
  'Laocoön and His Sons',
  'Mask of Tutankhamun',
  'View of Delft',
  'The Thinker',
]);

export const DEFAULT_CANON_LANGUAGES: readonly string[] = Object.freeze(['en', 'fr']);

export async function seedKbCanon(deps: SeedKbCanonDeps): Promise<SeedKbCanonResult> {
  const { client, repo, terms, languages, dryRun = false } = deps;
  const counters: SeedKbCanonResult = {
    total: terms.length * languages.length,
    attempted: 0,
    hits: 0,
    upserted: 0,
    errors: 0,
  };

  for (const term of terms) {
    for (const language of languages) {
      await processSeedPair({ client, repo, term, language, dryRun, counters });
    }
  }

  return counters;
}

interface ProcessSeedPairInput {
  readonly client: KnowledgeBaseProvider;
  readonly repo: WikidataKbDumpRepositoryPort;
  readonly term: string;
  readonly language: string;
  readonly dryRun: boolean;
  readonly counters: SeedKbCanonResult;
}

async function processSeedPair(input: ProcessSeedPairInput): Promise<void> {
  const { client, repo, term, language, dryRun, counters } = input;
  counters.attempted++;
  let facts;
  try {
    facts = await client.lookup({ searchTerm: term, language });
  } catch (err) {
    counters.errors++;
    logger.warn('kb_canon_seed_lookup_error', {
      searchTerm: term,
      language,
      error: errorMessage(err),
    });
    return;
  }

  if (facts === null) return;
  counters.hits++;
  if (dryRun) return;

  try {
    await repo.upsert(term, language, facts);
    counters.upserted++;
  } catch (err) {
    counters.errors++;
    logger.warn('kb_canon_seed_upsert_error', {
      searchTerm: term,
      language,
      error: errorMessage(err),
    });
  }
}
