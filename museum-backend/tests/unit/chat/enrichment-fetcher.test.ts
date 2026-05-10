jest.mock('@shared/logger/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import {
  extractSearchTerm,
  extractSuggestedImageEntries,
} from '@modules/chat/useCase/enrichment/enrichment-fetcher';

import { makeSuggestedImage } from '../../helpers/chat/enrichedImage.fixtures';

describe('extractSearchTerm', () => {
  it('returns the last assistant detectedArtwork.title when present', () => {
    const history = [
      { role: 'user', metadata: null },
      { role: 'assistant', metadata: { detectedArtwork: { title: 'Mona Lisa' } } },
      { role: 'user', metadata: null },
    ];
    expect(extractSearchTerm(history, 'unrelated input')).toBe('Mona Lisa');
  });

  it('falls back to inputText only when length ≥3 words and no detected title in history', () => {
    expect(extractSearchTerm([], 'tell me about Monet')).toBe('tell me about Monet');
    expect(extractSearchTerm([], 'two words')).toBeNull();
  });

  it('returns null when neither history detection nor input text qualifies', () => {
    expect(extractSearchTerm([], 'one')).toBeNull();
    expect(extractSearchTerm([], undefined)).toBeNull();
  });
});

describe('extractSuggestedImageEntries (C2 v2)', () => {
  it('R1 — returns LLM-authored v2 entries from the latest assistant turn', () => {
    const history = [
      {
        role: 'assistant',
        metadata: {
          suggestedImages: [
            makeSuggestedImage({ query: 'Monet' }),
            makeSuggestedImage({ query: 'Manet' }),
          ],
        },
      },
      { role: 'user', metadata: null },
    ];
    const entries = extractSuggestedImageEntries(history);
    expect(entries).toHaveLength(2);
    expect(entries?.[0].query).toBe('Monet');
  });

  it('R15 — caps to 4 entries even when LLM returns more', () => {
    const history = [
      {
        role: 'assistant',
        metadata: {
          suggestedImages: Array.from({ length: 6 }, (_, i) =>
            makeSuggestedImage({ query: `Q${String(i)}` }),
          ),
        },
      },
    ];
    const entries = extractSuggestedImageEntries(history);
    expect(entries).toHaveLength(4);
  });

  it('R2 — returns null when v1 (no rationale + caption) entries are present', () => {
    const history = [
      {
        role: 'assistant',
        metadata: {
          suggestedImages: [{ query: 'X', description: 'Y' }],
        },
      },
    ];
    expect(extractSuggestedImageEntries(history)).toBeNull();
  });

  it('returns null when no assistant turn carries suggestedImages', () => {
    const history = [
      { role: 'user', metadata: null },
      { role: 'assistant', metadata: { detectedArtwork: { title: 'Foo' } } },
    ];
    expect(extractSuggestedImageEntries(history)).toBeNull();
  });

  it('walks backward and prefers the most recent assistant turn with v2 entries', () => {
    const history = [
      {
        role: 'assistant',
        metadata: {
          suggestedImages: [makeSuggestedImage({ query: 'Earlier' })],
        },
      },
      { role: 'user', metadata: null },
      {
        role: 'assistant',
        metadata: {
          suggestedImages: [makeSuggestedImage({ query: 'Later' })],
        },
      },
    ];
    const entries = extractSuggestedImageEntries(history);
    expect(entries?.[0].query).toBe('Later');
  });

  it('skips entries that are missing rationale OR caption (defence-in-depth)', () => {
    const history = [
      {
        role: 'assistant',
        metadata: {
          suggestedImages: [
            { query: 'Q1', description: 'D1', rationale: 'R1', caption: 'C1' },
            { query: 'Q2', description: 'D2', rationale: 'R2' /* no caption */ },
          ],
        },
      },
    ];
    const entries = extractSuggestedImageEntries(history);
    expect(entries).toEqual([
      { query: 'Q1', description: 'D1', rationale: 'R1', caption: 'C1' },
    ]);
  });
});
