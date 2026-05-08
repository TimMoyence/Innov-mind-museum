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

  // Mutation guard: pin segment count to exactly 3 so an off-by-one operator
  // mutation (e.g. `!== 3` → `!== 4`) silently accepting 4-segment wires is
  // caught. Each distinct count must trip the "Malformed" branch.
  it.each([
    ['1 segment (no colon)', 'no-colons-here'],
    ['2 segments', 'one:two'],
    ['4 segments', 'one:two:three:four'],
    ['5 segments', 'a:b:c:d:e'],
  ])('rejects wire format with %s', (_label, wire) => {
    expect(() => decryptTotpSecret(wire)).toThrow(/Malformed/);
  });

  // Mutation guard: pin IV length to exactly IV_BYTES (12). Forge a wire with
  // a valid 16-byte tag + non-empty ciphertext but an IV of 11 / 13 bytes —
  // a mutant flipping `!== IV_BYTES` to `<` / `>` / a different constant would
  // silently feed a wrong-length IV into AES-GCM.
  it.each([
    ['11-byte IV (one short)', 11],
    ['13-byte IV (one long)', 13],
  ])('rejects wire format with %s', (_label, ivLen) => {
    const iv = Buffer.alloc(ivLen, 0x01);
    const tag = Buffer.alloc(16, 0x02);
    const ct = Buffer.alloc(8, 0x03);
    const wire = `${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`;
    expect(() => decryptTotpSecret(wire)).toThrow(/Invalid IV length/);
  });

  // Mutation guard: pin auth-tag length to exactly TAG_BYTES (16). Same shape
  // as the IV case — a mutant relaxing the equality check would let a forged
  // 15- or 17-byte tag reach `setAuthTag` and produce a different error class.
  it.each([
    ['15-byte tag (one short)', 15],
    ['17-byte tag (one long)', 17],
  ])('rejects wire format with %s', (_label, tagLen) => {
    const iv = Buffer.alloc(12, 0x01);
    const tag = Buffer.alloc(tagLen, 0x02);
    const ct = Buffer.alloc(8, 0x03);
    const wire = `${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`;
    expect(() => decryptTotpSecret(wire)).toThrow(/Invalid auth tag length/);
  });
});
