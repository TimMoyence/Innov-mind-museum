import {
  assertImageSize,
  decodeBase64Image,
  isSafeImageUrl,
} from '@modules/chat/application/image-input';

describe('image-input', () => {
  it('accepts safe https URLs only', () => {
    expect(isSafeImageUrl('https://example.com/image.jpg')).toBe(true);
    expect(isSafeImageUrl('http://example.com/image.jpg')).toBe(false);
    expect(isSafeImageUrl('https://localhost/image.jpg')).toBe(false);
  });

  it('decodes data URLs', () => {
    const decoded = decodeBase64Image('data:image/png;base64,aGVsbG8=');

    expect(decoded.mimeType).toBe('image/png');
    expect(decoded.base64).toBe('aGVsbG8=');
    expect(decoded.sizeBytes).toBeGreaterThan(0);
  });

  it('throws when image is too large', () => {
    expect(() => assertImageSize(200, 100)).toThrow('Image exceeds max size');
  });
});
