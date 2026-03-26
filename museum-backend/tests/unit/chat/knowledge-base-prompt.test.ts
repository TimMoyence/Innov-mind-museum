import { buildKnowledgeBasePromptBlock } from '@modules/chat/application/knowledge-base.prompt';
import type { ArtworkFacts } from '@modules/chat/domain/ports/knowledge-base.port';

const fullFacts: ArtworkFacts = {
  qid: 'Q12418',
  title: 'Mona Lisa',
  artist: 'Leonardo da Vinci',
  date: 'c. 1503',
  technique: 'Oil on poplar panel',
  collection: 'Musée du Louvre',
  movement: 'High Renaissance',
  genre: 'portrait',
};

describe('buildKnowledgeBasePromptBlock', () => {
  it('returns empty string for null facts', () => {
    expect(buildKnowledgeBasePromptBlock(null)).toBe('');
  });

  it('returns complete block with all fields', () => {
    const block = buildKnowledgeBasePromptBlock(fullFacts);

    expect(block).toContain('[KNOWLEDGE BASE');
    expect(block).toContain('Artwork: "Mona Lisa" (Q12418)');
    expect(block).toContain('Artist: Leonardo da Vinci');
    expect(block).toContain('Date: c. 1503');
    expect(block).toContain('Technique: Oil on poplar panel');
    expect(block).toContain('Collection: Musée du Louvre');
    expect(block).toContain('Movement: High Renaissance');
    expect(block).toContain('Genre: portrait');
  });

  it('omits lines for undefined fields', () => {
    const facts: ArtworkFacts = { qid: 'Q1', title: 'Test' };
    const block = buildKnowledgeBasePromptBlock(facts);

    expect(block).toContain('Artwork: "Test" (Q1)');
    expect(block).not.toContain('Artist:');
    expect(block).not.toContain('Date:');
    expect(block).not.toContain('Technique:');
    expect(block).not.toContain('Collection:');
    expect(block).not.toContain('Movement:');
    expect(block).not.toContain('Genre:');
  });

  it('omits lines for empty string fields', () => {
    const facts: ArtworkFacts = {
      qid: 'Q1',
      title: 'Test',
      artist: '',
      date: '   ',
      technique: '',
    };
    const block = buildKnowledgeBasePromptBlock(facts);

    expect(block).not.toContain('Artist:');
    expect(block).not.toContain('Date:');
    expect(block).not.toContain('Technique:');
  });

  it('truncates block at 400 chars', () => {
    const facts: ArtworkFacts = {
      qid: 'Q99999',
      title: 'A'.repeat(100),
      artist: 'B'.repeat(100),
      date: 'C'.repeat(100),
      technique: 'D'.repeat(100),
      collection: 'E'.repeat(100),
      movement: 'F'.repeat(100),
      genre: 'G'.repeat(100),
    };
    const block = buildKnowledgeBasePromptBlock(facts);

    expect(block.length).toBeLessThanOrEqual(400);
    expect(block).toMatch(/\.\.\.$/);
  });

  it('sanitizes values (strips zero-width chars)', () => {
    const facts: ArtworkFacts = {
      qid: 'Q1',
      title: 'Mona\u200BLisa',
      artist: 'Leo\u200Dnardo',
    };
    const block = buildKnowledgeBasePromptBlock(facts);

    expect(block).toContain('MonaLisa');
    expect(block).toContain('Leonardo');
    expect(block).not.toContain('\u200B');
    expect(block).not.toContain('\u200D');
  });

  it('contains header and instruction lines', () => {
    const block = buildKnowledgeBasePromptBlock(fullFacts);
    const lines = block.split('\n');

    expect(lines[0]).toBe('[KNOWLEDGE BASE — verified facts from Wikidata]');
    expect(lines[lines.length - 1]).toBe(
      'Use these verified facts as ground truth. Do not contradict them.',
    );
  });
});
