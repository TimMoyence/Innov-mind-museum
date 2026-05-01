import { NotableArtworksSchema } from '@shared/db/jsonb-schemas/user-memory-notable-artworks.schema';

describe('NotableArtworksSchema', () => {
  it('accepts an empty array (default state)', () => {
    expect(NotableArtworksSchema.safeParse([]).success).toBe(true);
  });

  it('accepts valid artwork entries with all optional fields', () => {
    const valid = [
      {
        title: 'Starry Night',
        artist: 'Van Gogh',
        museum: 'MoMA',
        sessionId: 'sess-abc-123',
        discussedAt: '2026-04-01T10:00:00.000Z',
      },
    ];
    expect(NotableArtworksSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts valid entry without optional artist and museum', () => {
    const valid = [
      {
        title: 'Mona Lisa',
        sessionId: 'sess-xyz-999',
        discussedAt: '2026-04-15T12:30:00.000Z',
      },
    ];
    expect(NotableArtworksSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects entry with empty title', () => {
    const invalid = [
      {
        title: '',
        sessionId: 'sess-abc',
        discussedAt: '2026-04-01T10:00:00.000Z',
      },
    ];
    expect(NotableArtworksSchema.safeParse(invalid).success).toBe(false);
  });

  it('rejects entry missing required sessionId', () => {
    const invalid = [
      {
        title: 'Some Painting',
        discussedAt: '2026-04-01T10:00:00.000Z',
      },
    ];
    expect(NotableArtworksSchema.safeParse(invalid).success).toBe(false);
  });

  it('rejects entry missing required discussedAt', () => {
    const invalid = [
      {
        title: 'Some Painting',
        sessionId: 'sess-abc',
      },
    ];
    expect(NotableArtworksSchema.safeParse(invalid).success).toBe(false);
  });

  it('rejects a non-array value', () => {
    expect(
      NotableArtworksSchema.safeParse({ title: 'x', sessionId: 'y', discussedAt: 'z' }).success,
    ).toBe(false);
  });
});
