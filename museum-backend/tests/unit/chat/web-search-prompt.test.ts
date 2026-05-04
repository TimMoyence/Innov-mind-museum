import { buildWebSearchPromptBlock } from '@modules/chat/useCase/web-search/web-search.prompt';
import type { SearchResult } from '@modules/chat/domain/ports/web-search.port';

const sampleResults: SearchResult[] = [
  {
    url: 'https://www.capc-bordeaux.fr/exhibitions',
    title: 'Current Exhibitions at CAPC',
    snippet: 'Discover the contemporary art exhibitions running this season at CAPC musée.',
  },
  {
    url: 'https://example.org/news/2026',
    title: 'Upcoming events',
    snippet: 'A list of upcoming cultural events.',
  },
];

describe('buildWebSearchPromptBlock', () => {
  it('returns empty string for null results', () => {
    expect(buildWebSearchPromptBlock(null)).toBe('');
  });

  it('returns empty string for empty array', () => {
    expect(buildWebSearchPromptBlock([])).toBe('');
  });

  it('returns a block with [WEB SEARCH] header for valid results', () => {
    const block = buildWebSearchPromptBlock(sampleResults);

    expect(block).toContain('[WEB SEARCH');
    expect(block).toContain('Current Exhibitions at CAPC');
    expect(block).toContain('Source: https://www.capc-bordeaux.fr/exhibitions');
    expect(block).toContain('www.capc-bordeaux.fr');
  });

  it('limits results in the block to 5 entries', () => {
    const many: SearchResult[] = Array.from({ length: 10 }, (_, i) => ({
      url: `https://example.com/${String(i)}`,
      title: `Title ${String(i)}`,
      snippet: `Snippet ${String(i)}`,
    }));

    const block = buildWebSearchPromptBlock(many);
    expect(block).toContain('Title 0');
    expect(block).toContain('Title 4');
    expect(block).not.toContain('Title 5');
    expect(block).not.toContain('Title 9');
  });

  it('includes citation instruction', () => {
    const block = buildWebSearchPromptBlock(sampleResults);
    expect(block).toContain('Cite sources as markdown links');
  });

  it('falls back to "web" when URL is malformed', () => {
    const bad: SearchResult[] = [
      {
        url: 'not-a-url',
        title: 'Broken',
        snippet: 'Nothing',
      },
    ];

    const block = buildWebSearchPromptBlock(bad);
    expect(block).toContain('— web');
  });

  it('truncates very long blocks to max length', () => {
    const huge: SearchResult[] = [
      {
        url: 'https://example.com/one',
        title: 'a'.repeat(500),
        snippet: 'b'.repeat(500),
      },
      {
        url: 'https://example.com/two',
        title: 'c'.repeat(500),
        snippet: 'd'.repeat(500),
      },
    ];

    const block = buildWebSearchPromptBlock(huge);
    expect(block.length).toBeLessThanOrEqual(1200);
  });
});
