import { validateSources } from '@modules/chat/useCase/orchestration/sources-validator';
import type { CitationSource } from '@modules/chat/domain/chat.types';
import { makeCitationSource } from '../../helpers/chat/citation-source.fixtures';

const MONA_FACT =
  'The Mona Lisa is a half-length portrait painting by Leonardo da Vinci, ' +
  'housed in the Louvre Museum in Paris.';

const STARRY_FACT =
  'The Starry Night is an oil-on-canvas painting by Vincent van Gogh from June 1889.';

describe('sources-validator — validateSources', () => {
  it('1. exact-match quote → 1 valid, 0 rejected', () => {
    const source = makeCitationSource({
      quote: 'The Mona Lisa is a half-length portrait painting by Leonardo da Vinci',
    });

    const result = validateSources([source], [MONA_FACT]);

    expect(result.valid).toHaveLength(1);
    expect(result.valid[0]).toBe(source);
    expect(result.rejected).toHaveLength(0);
  });

  it('2. case-mismatch quote → 1 valid (NFKC + lowercase normalizes)', () => {
    const source = makeCitationSource({
      quote: 'THE MONA LISA IS A HALF-LENGTH PORTRAIT PAINTING',
    });

    const result = validateSources([source], [MONA_FACT]);

    expect(result.valid).toHaveLength(1);
    expect(result.rejected).toHaveLength(0);
  });

  it('3. whitespace-divergent quote (tabs/newlines/multi-space) → 1 valid (collapse)', () => {
    const source = makeCitationSource({
      quote: 'The   Mona\tLisa\nis a   half-length portrait',
    });

    const result = validateSources([source], [MONA_FACT]);

    expect(result.valid).toHaveLength(1);
    expect(result.rejected).toHaveLength(0);
  });

  it('4. accent-form divergent quote (NFKC equivalent) → 1 valid', () => {
    const factWithPrecomposed = 'Le musée du Louvre abrite la Joconde depuis 1797.';
    const quoteWithDecomposed = 'Le musée du Louvre abrite la Joconde';

    const source = makeCitationSource({ quote: quoteWithDecomposed });

    const result = validateSources([source], [factWithPrecomposed]);

    expect(result.valid).toHaveLength(1);
    expect(result.rejected).toHaveLength(0);
  });

  it('5. quote not present in any fact → 1 rejected, reason=quote-not-found', () => {
    const source = makeCitationSource({
      quote: 'This sentence does not appear anywhere in the fact corpus.',
    });

    const result = validateSources([source], [MONA_FACT, STARRY_FACT]);

    expect(result.valid).toHaveLength(0);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].source).toBe(source);
    expect(result.rejected[0].reason).toBe('quote-not-found');
  });

  it('6. quote shorter than 10 chars (NFKC-normalized) → 1 rejected, reason=quote-too-short', () => {
    const source: CitationSource = {
      url: 'https://www.wikidata.org/wiki/Q12418',
      type: 'wikidata',
      title: 'Mona Lisa',
      quote: 'Mona Lisa',
    };

    const result = validateSources([source], [MONA_FACT]);

    expect(result.valid).toHaveLength(0);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].source).toBe(source);
    expect(result.rejected[0].reason).toBe('quote-too-short');
  });

  it('7. mixed batch: 1 valid + 1 not-found + 1 too-short → 1 valid, 2 rejected', () => {
    const valid = makeCitationSource({
      quote: 'The Starry Night is an oil-on-canvas painting by Vincent van Gogh',
    });
    const notFound = makeCitationSource({
      url: 'https://example.org/fake-article',
      type: 'web',
      title: 'Fake',
      quote: 'A sentence the LLM hallucinated which is nowhere in the corpus.',
    });
    const tooShort: CitationSource = {
      url: 'https://www.wikidata.org/wiki/Q12418',
      type: 'wikidata',
      title: 'Mona Lisa',
      quote: 'too short',
    };

    const result = validateSources([valid, notFound, tooShort], [MONA_FACT, STARRY_FACT]);

    expect(result.valid).toHaveLength(1);
    expect(result.valid[0]).toBe(valid);
    expect(result.rejected).toHaveLength(2);

    const rejectedReasons = result.rejected.map((r) => r.reason).sort();
    expect(rejectedReasons).toEqual(['quote-not-found', 'quote-too-short']);

    const rejectedSources = result.rejected.map((r) => r.source);
    expect(rejectedSources).toEqual(expect.arrayContaining([notFound, tooShort]));
  });

  it('8. empty sources input → 0 valid, 0 rejected (no-op safety)', () => {
    const result = validateSources([], [MONA_FACT]);

    expect(result.valid).toEqual([]);
    expect(result.rejected).toEqual([]);
  });

  it('9. empty facts corpus → all sources rejected as quote-not-found', () => {
    const source = makeCitationSource();

    const result = validateSources([source], []);

    expect(result.valid).toHaveLength(0);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].reason).toBe('quote-not-found');
  });
});
