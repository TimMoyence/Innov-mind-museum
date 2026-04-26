import { decryptTotpSecret, encryptTotpSecret } from '@modules/auth/useCase/totp/totpEncryption';

describe('totpEncryption', () => {
  it('round-trips a plaintext secret', () => {
    const plaintext = 'JBSWY3DPEHPK3PXP';
    const encoded = encryptTotpSecret(plaintext);
    expect(encoded).not.toContain(plaintext);
    expect(decryptTotpSecret(encoded)).toBe(plaintext);
  });

  it('emits a fresh IV per encryption (no deterministic ciphertexts)', () => {
    const plaintext = 'JBSWY3DPEHPK3PXP';
    const a = encryptTotpSecret(plaintext);
    const b = encryptTotpSecret(plaintext);
    expect(a).not.toBe(b);
    // Both still decrypt to the same plaintext.
    expect(decryptTotpSecret(a)).toBe(plaintext);
    expect(decryptTotpSecret(b)).toBe(plaintext);
  });

  it('rejects ciphertext when the auth tag is tampered with', () => {
    const encoded = encryptTotpSecret('JBSWY3DPEHPK3PXP');
    const [iv, tagB64, ct] = encoded.split(':');
    const tag = Buffer.from(tagB64, 'base64');
    // Flip a single bit in the tag.
    tag[0] ^= 0x01;
    const tampered = `${iv}:${tag.toString('base64')}:${ct}`;
    expect(() => decryptTotpSecret(tampered)).toThrow();
  });

  it('rejects ciphertext when ciphertext bytes are tampered with', () => {
    const encoded = encryptTotpSecret('JBSWY3DPEHPK3PXP');
    const [iv, tag, ctB64] = encoded.split(':');
    const ct = Buffer.from(ctB64, 'base64');
    if (ct.length === 0) throw new Error('empty ciphertext — fixture invariant violated');
    ct[0] ^= 0x01;
    const tampered = `${iv}:${tag}:${ct.toString('base64')}`;
    expect(() => decryptTotpSecret(tampered)).toThrow();
  });

  it('rejects malformed wire formats', () => {
    expect(() => decryptTotpSecret('not-a-ciphertext')).toThrow(/Malformed/);
    expect(() => decryptTotpSecret('only:two')).toThrow(/Malformed/);
    expect(() => decryptTotpSecret('aaaa:bbbb:cccc')).toThrow();
  });
});
