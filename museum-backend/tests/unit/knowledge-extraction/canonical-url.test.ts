import { canonicalizeUrl } from '@modules/knowledge-extraction/domain/extracted-content/canonical-url';

describe('canonicalizeUrl', () => {
  it('strips trailing slash from non-root path', () => {
    expect(canonicalizeUrl('https://example.com/mona-lisa/')).toBe('https://example.com/mona-lisa');
  });

  it('preserves root path (no slash strip)', () => {
    expect(canonicalizeUrl('https://example.com/')).toBe('https://example.com/');
  });

  it('leaves URL without trailing slash unchanged', () => {
    expect(canonicalizeUrl('https://example.com/artwork')).toBe('https://example.com/artwork');
  });

  it('strips trailing slash from nested path', () => {
    expect(canonicalizeUrl('https://louvre.fr/en/collections/paintings/')).toBe(
      'https://louvre.fr/en/collections/paintings',
    );
  });

  it('sorts query params alphabetically', () => {
    expect(canonicalizeUrl('https://example.com/search?z=last&a=first&m=mid')).toBe(
      'https://example.com/search?a=first&m=mid&z=last',
    );
  });

  it('produces identical output for same params in different order', () => {
    const urlA = canonicalizeUrl('https://example.com/search?sort=asc&page=2');
    const urlB = canonicalizeUrl('https://example.com/search?page=2&sort=asc');
    expect(urlA).toBe(urlB);
  });

  it('preserves single query param unchanged', () => {
    expect(canonicalizeUrl('https://example.com/art?lang=en')).toBe(
      'https://example.com/art?lang=en',
    );
  });

  it('handles URL with no query params', () => {
    expect(canonicalizeUrl('https://example.com/artwork')).toBe('https://example.com/artwork');
  });

  it('strips trailing slash AND sorts query params in one pass', () => {
    expect(canonicalizeUrl('https://example.com/gallery/?z=3&a=1')).toBe(
      'https://example.com/gallery?a=1&z=3',
    );
  });

  it('produces same canonical URL regardless of trailing slash or param order', () => {
    const a = canonicalizeUrl('https://example.com/mona-lisa/?b=2&a=1');
    const b = canonicalizeUrl('https://example.com/mona-lisa?a=1&b=2');
    expect(a).toBe(b);
  });

  it('preserves https scheme', () => {
    const result = canonicalizeUrl('https://example.com/art');
    expect(result.startsWith('https://')).toBe(true);
  });

  it('preserves hostname casing as-is (URL spec lowercases host)', () => {
    const result = canonicalizeUrl('https://EXAMPLE.COM/art');
    expect(result).toBe('https://example.com/art');
  });
});
