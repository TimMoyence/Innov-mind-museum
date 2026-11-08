import {
  HEX_COLOR_PATTERN,
  HTTPS_URL_PATTERN,
  SLUG_PATTERN,
  isHexColor,
  isHttpsUrl,
  isSlug,
} from '@musaium/shared';

describe('@musaium/shared museum — règles de slug, couleur et logo', () => {
  it.each([
    ['my-museum-1', true],
    ['abc123', true],
    ['My-Museum', false],
    ['my museum', false],
    ['', false],
  ])('isSlug(%s) === %s', (value, expected) => {
    expect(isSlug(value)).toBe(expected);
  });

  it.each([
    ['#aabbcc', true],
    ['#AABBCC', true],
    ['#abc', false],
    ['aabbcc', false],
    ['', false],
  ])('isHexColor(%s) === %s', (value, expected) => {
    expect(isHexColor(value)).toBe(expected);
  });

  it.each([
    ['https://x.com', true],
    ['HTTPS://x.com', true],
    ['http://x.com', false],
    ['https://x .com', false],
    ['javascript:alert(1)', false],
    ['', false],
  ])('isHttpsUrl(%s) === %s', (value, expected) => {
    expect(isHttpsUrl(value)).toBe(expected);
  });

  it('les motifs gardent la forme exacte des anciennes copies web, mobile et serveur', () => {
    expect(SLUG_PATTERN.source).toBe('^[a-z0-9-]+$');
    expect(SLUG_PATTERN.flags).toBe('');
    expect(HEX_COLOR_PATTERN.source).toBe('^#[0-9a-fA-F]{6}$');
    expect(HEX_COLOR_PATTERN.flags).toBe('');
    expect(HTTPS_URL_PATTERN.source).toBe('^https:\\/\\/[^\\s]+$');
    expect(HTTPS_URL_PATTERN.flags).toBe('i');
  });
});
