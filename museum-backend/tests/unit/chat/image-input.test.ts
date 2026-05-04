import {
  assertImageSize,
  assertMagicBytes,
  decodeBase64Image,
  detectImageMimeFromBytes,
  isSafeImageUrl,
} from '@modules/chat/useCase/image/image-input';

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
    expect(() => {
      assertImageSize(200, 100);
    }).toThrow('Image exceeds max size');
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

  describe('SSRF protection', () => {
    // --- Protocol enforcement ---

    it('rejects http:// (non-HTTPS)', () => {
      expect(isSafeImageUrl('http://example.com/image.jpg')).toBe(false);
    });

    it('rejects ftp:// protocol', () => {
      expect(isSafeImageUrl('ftp://internal/image.jpg')).toBe(false);
    });

    it('rejects file:// protocol', () => {
      expect(isSafeImageUrl('file:///etc/passwd')).toBe(false);
    });

    it('rejects invalid URL', () => {
      expect(isSafeImageUrl('not-a-url')).toBe(false);
    });

    // --- IPv4 private ranges ---

    it('rejects IPv4 loopback 127.0.0.1', () => {
      expect(isSafeImageUrl('https://127.0.0.1/image.jpg')).toBe(false);
    });

    it('rejects IPv4 loopback 127.255.255.255', () => {
      expect(isSafeImageUrl('https://127.255.255.255/image.jpg')).toBe(false);
    });

    it('rejects private class A 10.0.0.1', () => {
      expect(isSafeImageUrl('https://10.0.0.1/image.jpg')).toBe(false);
    });

    it('rejects private class A 10.255.255.255', () => {
      expect(isSafeImageUrl('https://10.255.255.255/image.jpg')).toBe(false);
    });

    it('rejects private class B 172.16.0.1', () => {
      expect(isSafeImageUrl('https://172.16.0.1/image.jpg')).toBe(false);
    });

    it('rejects private class B 172.31.255.255', () => {
      expect(isSafeImageUrl('https://172.31.255.255/image.jpg')).toBe(false);
    });

    it('allows non-private 172.15.0.1 (below class B range)', () => {
      expect(isSafeImageUrl('https://172.15.0.1/image.jpg')).toBe(true);
    });

    it('allows non-private 172.32.0.1 (above class B range)', () => {
      expect(isSafeImageUrl('https://172.32.0.1/image.jpg')).toBe(true);
    });

    it('rejects private class C 192.168.0.1', () => {
      expect(isSafeImageUrl('https://192.168.0.1/image.jpg')).toBe(false);
    });

    it('rejects private class C 192.168.255.255', () => {
      expect(isSafeImageUrl('https://192.168.255.255/image.jpg')).toBe(false);
    });

    // --- Special addresses ---

    it('rejects unspecified address 0.0.0.0', () => {
      expect(isSafeImageUrl('https://0.0.0.0/image.jpg')).toBe(false);
    });

    it('rejects localhost hostname', () => {
      expect(isSafeImageUrl('https://localhost/image.jpg')).toBe(false);
    });

    it('rejects LOCALHOST (case insensitive)', () => {
      expect(isSafeImageUrl('https://LOCALHOST/image.jpg')).toBe(false);
    });

    it('rejects AWS metadata 169.254.169.254', () => {
      expect(isSafeImageUrl('https://169.254.169.254/latest/meta-data')).toBe(false);
    });

    it('rejects link-local 169.254.0.1', () => {
      expect(isSafeImageUrl('https://169.254.0.1/image.jpg')).toBe(false);
    });

    // --- Carrier-grade NAT (100.64.0.0/10) ---

    it('rejects CGNAT 100.64.0.1', () => {
      expect(isSafeImageUrl('https://100.64.0.1/image.jpg')).toBe(false);
    });

    it('rejects CGNAT 100.127.255.255', () => {
      expect(isSafeImageUrl('https://100.127.255.255/image.jpg')).toBe(false);
    });

    // --- IPv6 ---

    it('rejects IPv6 loopback [::1]', () => {
      expect(isSafeImageUrl('https://[::1]/image.jpg')).toBe(false);
    });

    it('rejects IPv6 link-local [fe80::1]', () => {
      expect(isSafeImageUrl('https://[fe80::1]/image.jpg')).toBe(false);
    });

    it('rejects IPv6 unique local fc (e.g. [fc00::1])', () => {
      expect(isSafeImageUrl('https://[fc00::1]/image.jpg')).toBe(false);
    });

    it('rejects IPv6 unique local fd (e.g. [fd12::1])', () => {
      expect(isSafeImageUrl('https://[fd12::1]/image.jpg')).toBe(false);
    });

    // --- IPv4-mapped IPv6 ---

    it('rejects IPv4-mapped IPv6 [::ffff:127.0.0.1]', () => {
      expect(isSafeImageUrl('https://[::ffff:127.0.0.1]/image.jpg')).toBe(false);
    });

    it('rejects IPv4-mapped IPv6 [::ffff:10.0.0.1]', () => {
      expect(isSafeImageUrl('https://[::ffff:10.0.0.1]/image.jpg')).toBe(false);
    });

    it('rejects IPv4-mapped IPv6 [::ffff:192.168.1.1]', () => {
      expect(isSafeImageUrl('https://[::ffff:192.168.1.1]/image.jpg')).toBe(false);
    });

    // --- Hex-encoded IPs ---

    it('rejects hex-encoded IP 0x7f000001 (127.0.0.1)', () => {
      expect(isSafeImageUrl('https://0x7f000001/image.jpg')).toBe(false);
    });

    it('rejects hex-encoded IP 0x0a000001 (10.0.0.1)', () => {
      expect(isSafeImageUrl('https://0x0a000001/image.jpg')).toBe(false);
    });

    // --- Octal-encoded IPs ---

    it('rejects octal-encoded IP 0177.0.0.1 (127.0.0.1)', () => {
      expect(isSafeImageUrl('https://0177.0.0.1/image.jpg')).toBe(false);
    });

    it('rejects octal-encoded IP 012.0.0.1 (10.0.0.1)', () => {
      expect(isSafeImageUrl('https://012.0.0.1/image.jpg')).toBe(false);
    });

    // --- Port enforcement ---

    it('rejects non-443 port', () => {
      expect(isSafeImageUrl('https://example.com:8080/image.jpg')).toBe(false);
    });

    it('rejects port 80', () => {
      expect(isSafeImageUrl('https://example.com:80/image.jpg')).toBe(false);
    });

    it('allows port 443 explicitly', () => {
      expect(isSafeImageUrl('https://example.com:443/image.jpg')).toBe(true);
    });

    // --- Legitimate URLs ---

    it('allows legitimate HTTPS image URL', () => {
      expect(isSafeImageUrl('https://cdn.example.com/images/art.jpg')).toBe(true);
    });

    it('allows legitimate HTTPS URL with path and query', () => {
      expect(isSafeImageUrl('https://images.museum.org/api/v2/image?id=123&size=large')).toBe(true);
    });
  });
});

describe('magic bytes validation', () => {
  // Real magic-byte prefixes encoded as base64
  const jpegBase64 = Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  ]).toString('base64');
  const pngBase64 = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  ]).toString('base64');
  const gifBase64 = Buffer.from([
    0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  ]).toString('base64');
  // RIFF header (bytes 0-3) + file size placeholder (bytes 4-7) + WEBP marker (bytes 8-11)
  const webpBase64 = Buffer.from([
    0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
  ]).toString('base64');

  describe('detectImageMimeFromBytes', () => {
    it('detects JPEG from magic bytes', () => {
      expect(detectImageMimeFromBytes(jpegBase64)).toBe('image/jpeg');
    });

    it('detects PNG from magic bytes', () => {
      expect(detectImageMimeFromBytes(pngBase64)).toBe('image/png');
    });

    it('detects GIF from magic bytes', () => {
      expect(detectImageMimeFromBytes(gifBase64)).toBe('image/gif');
    });

    it('detects WebP from magic bytes', () => {
      expect(detectImageMimeFromBytes(webpBase64)).toBe('image/webp');
    });

    it('returns null for random bytes', () => {
      const randomBase64 = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04]).toString('base64');
      expect(detectImageMimeFromBytes(randomBase64)).toBeNull();
    });

    it('returns null for too-short input', () => {
      const shortBase64 = Buffer.from([0xff, 0xd8]).toString('base64');
      expect(detectImageMimeFromBytes(shortBase64)).toBeNull();
    });

    it('returns null for empty base64', () => {
      expect(detectImageMimeFromBytes('')).toBeNull();
    });
  });

  describe('assertMagicBytes', () => {
    it('does not throw for valid JPEG bytes', () => {
      expect(() => {
        assertMagicBytes(jpegBase64);
      }).not.toThrow();
    });

    it('does not throw for valid PNG bytes', () => {
      expect(() => {
        assertMagicBytes(pngBase64);
      }).not.toThrow();
    });

    it('throws for random non-image bytes', () => {
      const textBase64 = Buffer.from('Hello, this is not an image').toString('base64');
      expect(() => {
        assertMagicBytes(textBase64);
      }).toThrow('Uploaded file does not appear to be a valid image');
    });

    it('throws for empty input', () => {
      expect(() => {
        assertMagicBytes('');
      }).toThrow('Uploaded file does not appear to be a valid image');
    });

    it('throws for too-short input', () => {
      const shortBase64 = Buffer.from([0x89, 0x50]).toString('base64');
      expect(() => {
        assertMagicBytes(shortBase64);
      }).toThrow('Uploaded file does not appear to be a valid image');
    });
  });
});
