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

  it('blocks 0.0.0.0', () => {
    expect(isSafeImageUrl('https://0.0.0.0/image.jpg')).toBe(false);
  });

  it('blocks ::1', () => {
    expect(isSafeImageUrl('https://[::1]/image.jpg')).toBe(false);
  });

  it('blocks 169.254.x.x link-local', () => {
    expect(isSafeImageUrl('https://169.254.1.1/image.jpg')).toBe(false);
  });

  it('blocks non-443 ports', () => {
    expect(isSafeImageUrl('https://example.com:8080/image.jpg')).toBe(false);
  });

  it('allows standard https without port', () => {
    expect(isSafeImageUrl('https://example.com/image.jpg')).toBe(true);
  });

  it('allows https on port 443', () => {
    expect(isSafeImageUrl('https://example.com:443/image.jpg')).toBe(true);
  });

  it('blocks IPv4-mapped IPv6 ::ffff:127.0.0.1', () => {
    expect(isSafeImageUrl('https://[::ffff:127.0.0.1]/image.jpg')).toBe(false);
  });

  it('blocks IPv4-mapped IPv6 ::ffff:10.0.0.1', () => {
    expect(isSafeImageUrl('https://[::ffff:10.0.0.1]/image.jpg')).toBe(false);
  });
});
