import { extractMetadata } from '@modules/chat/useCase/orchestration/assistant-response';

describe('extractMetadata', () => {
  it('extractMetadata extracts all fields correctly', () => {
    const meta = extractMetadata({
      deeperContext: 'Deep.',
      openQuestion: 'See this?',
      suggestedFollowUp: 'Why is Q1 important?',
      imageDescription: 'Oil on canvas.',
      recommendations: ['Room 5'],
      expertiseSignal: 'expert',
      citations: ['ref-1'],
      detectedArtwork: {
        title: 'Mona Lisa',
        artist: 'da Vinci',
        confidence: 0.99,
        source: 'vision',
        museum: 'Louvre',
        room: 'Room 6',
      },
    });

    expect(meta.deeperContext).toBe('Deep.');
    expect(meta.openQuestion).toBe('See this?');
    expect(meta.suggestedFollowUp).toBe('Why is Q1 important?');
    expect(meta.imageDescription).toBe('Oil on canvas.');
    expect(meta.recommendations).toEqual(['Room 5']);
    expect(meta.expertiseSignal).toBe('expert');
    expect(meta.citations).toEqual(['ref-1']);
    expect(meta.detectedArtwork?.title).toBe('Mona Lisa');
    expect(meta.detectedArtwork?.museum).toBe('Louvre');
  });

  // --- Uncovered branches in extractMetadata helper functions ---

  it('returns undefined citations when value is not an array', () => {
    const meta = extractMetadata({ citations: 'not-an-array' });
    expect(meta.citations).toBeUndefined();
  });

  it('returns undefined citations when array contains only non-strings', () => {
    const meta = extractMetadata({ citations: [123, true, null] });
    expect(meta.citations).toBeUndefined();
  });

  it('filters non-string items from citations array', () => {
    const meta = extractMetadata({ citations: ['valid', 42, 'also-valid'] });
    expect(meta.citations).toEqual(['valid', 'also-valid']);
  });

  it('returns undefined recommendations when not an array', () => {
    const meta = extractMetadata({ recommendations: 'single-string' });
    expect(meta.recommendations).toBeUndefined();
  });

  it('returns undefined recommendations when all items are empty or non-string', () => {
    const meta = extractMetadata({ recommendations: ['', '  ', 42] });
    expect(meta.recommendations).toBeUndefined();
  });

  it('caps recommendations at 5 items', () => {
    const meta = extractMetadata({
      recommendations: ['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7'],
    });
    expect(meta.recommendations).toHaveLength(5);
  });

  it('returns undefined suggestedFollowUp when value is empty / whitespace (B3)', () => {
    expect(extractMetadata({ suggestedFollowUp: '' }).suggestedFollowUp).toBeUndefined();
    expect(extractMetadata({ suggestedFollowUp: '   ' }).suggestedFollowUp).toBeUndefined();
  });

  it('rejects suggestedFollowUp strings strictly over 80 chars (B3 strict drop)', () => {
    const meta = extractMetadata({
      suggestedFollowUp: 'x'.repeat(81),
    });
    expect(meta.suggestedFollowUp).toBeUndefined();
  });

  it('ignores suggestedFollowUp when not a string (singularity invariant — array rejected)', () => {
    const meta = extractMetadata({ suggestedFollowUp: ['array', 'forbidden'] });
    expect(meta.suggestedFollowUp).toBeUndefined();
  });

  it('returns undefined for empty-string deeperContext', () => {
    const meta = extractMetadata({ deeperContext: '   ' });
    expect(meta.deeperContext).toBeUndefined();
  });

  it('returns undefined for non-string deeperContext', () => {
    const meta = extractMetadata({ deeperContext: 42 });
    expect(meta.deeperContext).toBeUndefined();
  });

  it('returns undefined for empty-string openQuestion', () => {
    const meta = extractMetadata({ openQuestion: '' });
    expect(meta.openQuestion).toBeUndefined();
  });

  it('trims toOptionalString values', () => {
    const meta = extractMetadata({ deeperContext: '  trimmed  ' });
    expect(meta.deeperContext).toBe('trimmed');
  });

  it('returns undefined expertiseSignal for invalid level', () => {
    const meta = extractMetadata({ expertiseSignal: 'master' });
    expect(meta.expertiseSignal).toBeUndefined();
  });

  it('returns undefined expertiseSignal for non-string value', () => {
    const meta = extractMetadata({ expertiseSignal: 42 });
    expect(meta.expertiseSignal).toBeUndefined();
  });

  it('returns undefined suggestedImages when not an array', () => {
    const meta = extractMetadata({ suggestedImages: 'not-array' });
    expect(meta.suggestedImages).toBeUndefined();
  });

  it('filters invalid items from suggestedImages (v1 entries get fallback rationale + caption)', () => {
    const meta = extractMetadata({
      suggestedImages: [
        { query: 'valid', description: 'desc' },
        { query: 'missing-desc' },
        'not-an-object',
        null,
        { query: 123, description: 'wrong type' },
      ],
    });
    // C2 v2 (R7): entries missing rationale/caption fall back gracefully —
    // caption defaults to description, rationale to the empty-string sentinel
    // (the FE swaps it for `chat.enrichment.rationale_fallback`).
    expect(meta.suggestedImages).toEqual([
      { query: 'valid', description: 'desc', rationale: '', caption: 'desc' },
    ]);
  });

  it('returns undefined suggestedImages when all items are invalid', () => {
    const meta = extractMetadata({
      suggestedImages: [null, 'string', { noQuery: true }],
    });
    expect(meta.suggestedImages).toBeUndefined();
  });

  it('caps suggestedImages at 4 items (C2 v2 — Q3 RESOLVED bumps cap 3→4)', () => {
    const meta = extractMetadata({
      suggestedImages: [
        { query: 'q1', description: 'd1' },
        { query: 'q2', description: 'd2' },
        { query: 'q3', description: 'd3' },
        { query: 'q4', description: 'd4' },
        { query: 'q5', description: 'd5' },
      ],
    });
    expect(meta.suggestedImages).toHaveLength(4);
  });

  it('preserves valid v2 entries with rationale + caption (R6 contract)', () => {
    const meta = extractMetadata({
      suggestedImages: [
        {
          query: 'Mona Lisa',
          description: 'The painting',
          rationale: 'The work the visitor asked about.',
          caption: 'Mona Lisa at the Louvre',
        },
      ],
    });
    expect(meta.suggestedImages).toEqual([
      {
        query: 'Mona Lisa',
        description: 'The painting',
        rationale: 'The work the visitor asked about.',
        caption: 'Mona Lisa at the Louvre',
      },
    ]);
  });

  it('falls back caption=description and rationale="" when only rationale empty (R7)', () => {
    const meta = extractMetadata({
      suggestedImages: [
        {
          query: 'Q1',
          description: 'D1',
          rationale: '   ',
          caption: 'C1',
        },
      ],
    });
    expect(meta.suggestedImages).toEqual([
      { query: 'Q1', description: 'D1', rationale: '', caption: 'C1' },
    ]);
  });

  // --- detectedArtwork validation (valid + invalid) ---

  it('skips detectedArtwork when it is not an object', () => {
    const meta = extractMetadata({ detectedArtwork: 'not-object' });
    expect(meta.detectedArtwork).toBeUndefined();

    const metaNull = extractMetadata({ detectedArtwork: null });
    expect(metaNull.detectedArtwork).toBeUndefined();
  });

  it('handles detectedArtwork with mixed valid and invalid field types', () => {
    const meta = extractMetadata({
      detectedArtwork: {
        artworkId: 123, // non-string → dropped
        title: 'Test',
        confidence: 'high', // non-number → dropped
        source: 42, // non-string → dropped
        artist: ['arr'], // non-string → dropped
        museum: true, // non-string → dropped
        room: 5, // non-string → dropped
      },
    });
    expect(meta.detectedArtwork?.title).toBe('Test');
    expect(meta.detectedArtwork?.artworkId).toBeUndefined();
    expect(meta.detectedArtwork?.confidence).toBeUndefined();
    expect(meta.detectedArtwork?.source).toBeUndefined();
    expect(meta.detectedArtwork?.artist).toBeUndefined();
    expect(meta.detectedArtwork?.museum).toBeUndefined();
    expect(meta.detectedArtwork?.room).toBeUndefined();
  });
});
