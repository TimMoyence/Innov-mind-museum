import {
  buildSttPromptBias,
  buildSttPromptBiasFromVisitContext,
} from '@modules/chat/useCase/audio/stt-prompt-bias';

describe('buildSttPromptBias (W7.4)', () => {
  it('returns undefined when nothing to bias', () => {
    expect(buildSttPromptBias({})).toBeUndefined();
    expect(buildSttPromptBias({ artworks: [] })).toBeUndefined();
  });

  it('joins museum name + artist + title with ". " separator', () => {
    const prompt = buildSttPromptBias({
      museumName: 'Musée du Louvre',
      artworks: [
        { title: 'La Joconde', artist: 'Léonard de Vinci' },
        { title: 'La Liberté guidant le peuple', artist: 'Eugène Delacroix' },
      ],
    });
    expect(prompt).toBeDefined();
    expect(prompt).toContain('Musée du Louvre');
    expect(prompt).toContain('Léonard de Vinci');
    expect(prompt).toContain('La Joconde');
    expect(prompt).toContain('. ');
  });

  it('caps the prompt at 896 chars', () => {
    const big = Array.from({ length: 200 }, (_, i) => ({
      title: `Artwork title number ${String(i)} that is rather long`,
      artist: `Artist Name ${String(i)}`,
    }));
    const prompt = buildSttPromptBias({ museumName: 'Big Museum', artworks: big });
    expect(prompt).toBeDefined();
    expect(prompt!.length).toBeLessThanOrEqual(896);
  });

  it('deduplicates repeated entries', () => {
    const prompt = buildSttPromptBias({
      artworks: [
        { title: 'La Joconde', artist: 'Léonard de Vinci' },
        { title: 'La Joconde', artist: 'Léonard de Vinci' },
        { title: 'La Cène', artist: 'Léonard de Vinci' },
      ],
    });
    expect(prompt).toBeDefined();
    // "Léonard de Vinci" should appear once even though both works share it.
    const matches = prompt!.match(/Léonard de Vinci/g) ?? [];
    expect(matches).toHaveLength(1);
  });

  it('strips PII-shaped tokens (defensive — museum data should never contain PII)', () => {
    const prompt = buildSttPromptBias({
      museumName: 'visitor@example.com',
      artworks: [{ title: 'La Joconde', artist: 'Picasso' }],
    });
    expect(prompt).toBeDefined();
    expect(prompt).not.toContain('visitor@example.com');
    expect(prompt).toContain('Picasso');
  });

  it('produces undefined when only PII-shaped tokens were available', () => {
    expect(
      buildSttPromptBias({
        museumName: '+33 6 12 34 56 78',
        artworks: [{ title: 'someone@example.com', artist: 'a@b.co' }],
      }),
    ).toBeUndefined();
  });
});

describe('buildSttPromptBiasFromVisitContext (W7.4)', () => {
  it('returns undefined for null/empty visit context', () => {
    expect(buildSttPromptBiasFromVisitContext(null)).toBeUndefined();
    expect(buildSttPromptBiasFromVisitContext(undefined)).toBeUndefined();
  });

  it('maps VisitContext.artworksDiscussed shape correctly', () => {
    const prompt = buildSttPromptBiasFromVisitContext({
      museumName: 'Musée d’Orsay',
      museumConfidence: 0.9,
      artworksDiscussed: [
        {
          title: 'Bal du moulin de la Galette',
          artist: 'Pierre-Auguste Renoir',
          messageId: 'm1',
          discussedAt: '2026-05-17T10:00:00Z',
        },
      ],
      roomsVisited: [],
      detectedExpertise: 'beginner',
      expertiseSignals: 0,
      lastUpdated: '2026-05-17T10:00:00Z',
    });
    expect(prompt).toContain('Musée d’Orsay');
    expect(prompt).toContain('Pierre-Auguste Renoir');
    expect(prompt).toContain('Bal du moulin de la Galette');
  });
});
