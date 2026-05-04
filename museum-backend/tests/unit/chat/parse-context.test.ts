import { parseContext } from '@modules/chat/adapters/primary/http/helpers/chat-route.helpers';

describe('parseContext — payload size limit', () => {
  it('accepts a context object under the size limit', () => {
    const ctx = { location: 'Paris', museumMode: true, guideLevel: 'beginner', locale: 'fr' };
    const result = parseContext(ctx);
    expect(result).not.toBeNull();
    expect(result).not.toBeUndefined();
    expect(result?.location).toBe('Paris');
  });

  it('rejects a string context exceeding MAX_CONTEXT_BYTES', () => {
    const oversized = JSON.stringify({ location: 'x'.repeat(2100) });
    expect(() => parseContext(oversized)).toThrow('context payload too large');
  });

  it('rejects an object context exceeding MAX_CONTEXT_BYTES', () => {
    const oversized = { location: 'x'.repeat(2100) };
    expect(() => parseContext(oversized)).toThrow('context payload too large');
  });

  it('accepts a string context under the size limit', () => {
    const ctx = JSON.stringify({ location: 'Berlin', locale: 'de' });
    const result = parseContext(ctx);
    expect(result).not.toBeNull();
    expect(result).not.toBeUndefined();
    expect(result?.location).toBe('Berlin');
  });

  it('returns undefined for null/undefined/empty input', () => {
    expect(parseContext(undefined)).toBeUndefined();
    expect(parseContext(null)).toBeUndefined();
    expect(parseContext('')).toBeUndefined();
  });
});
