import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

import { env } from '@src/config/env';

/**
 * AES-256-GCM for TOTP shared-secret at rest (R16).
 *
 * Wire format: `base64(iv):base64(authTag):base64(ciphertext)` — three fields
 * so GCM auth-tag tampering throws on decrypt (a single concatenated buffer
 * would silently swallow off-by-one slicing bugs) and stays human-readable in
 * DB dumps for ops.
 *
 * 32-byte key derived via SHA-256 from `env.auth.mfaEncryptionKey` to accept
 * any operator-supplied form (raw/hex/base64/passphrase). SHA-256 is NOT a KDF
 * but the env value is already a high-entropy rotated secret, so HKDF/Scrypt
 * would only add complexity (matches `MEDIA_SIGNING_SECRET` pattern).
 */

const IV_BYTES = 12;
const TAG_BYTES = 16;
const ALGORITHM = 'aes-256-gcm';

const deriveKey = (rawKey: string): Buffer => {
  return createHash('sha256').update(rawKey, 'utf8').digest();
};

/** Fresh random 12 B IV per call — required for GCM nonce uniqueness. */
export function encryptTotpSecret(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const key = deriveKey(env.auth.mfaEncryptionKey);
  // `authTagLength` pins GCM tag size crypto-side (defence in depth — semgrep `gcm-no-tag-length`).
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES });
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${tag.toString('base64')}:${ciphertext.toString('base64')}`;
}

/**
 * Throws on malformed wire, IV/tag length mismatch, or GCM auth-tag mismatch
 * (`'Unsupported state or unable to authenticate data'`). Callers MUST treat
 * any throw as a security event — corrupt-at-rest or tampering; lock the user
 * out of MFA-protected actions until re-enrolled.
 */
export function decryptTotpSecret(wire: string): string {
  const segments = wire.split(':');
  if (segments.length !== 3) {
    throw new Error(
      `Malformed TOTP ciphertext: expected 3 segments, got ${String(segments.length)}`,
    );
  }
  const [ivB64, tagB64, ctB64] = segments;
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const ct = Buffer.from(ctB64, 'base64');

  if (iv.length !== IV_BYTES) {
    throw new Error(`Invalid IV length: expected ${String(IV_BYTES)}, got ${String(iv.length)}`);
  }
  if (tag.length !== TAG_BYTES) {
    throw new Error(
      `Invalid auth tag length: expected ${String(TAG_BYTES)}, got ${String(tag.length)}`,
    );
  }

  const key = deriveKey(env.auth.mfaEncryptionKey);
  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES });
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ct), decipher.final()]);
  return plaintext.toString('utf8');
}
