import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

import { env } from '@src/config/env';

/**
 * AES-256-GCM helpers for the TOTP shared-secret at rest (R16).
 *
 * Wire format:
 *   `base64(iv) + ':' + base64(authTag) + ':' + base64(ciphertext)`
 *
 * Why three fields instead of one concatenated buffer:
 *   - GCM auth-tag tampering must throw on decrypt — a single buffer split
 *     would silently swallow off-by-one slicing bugs.
 *   - The colon-delimited shape stays human-readable in DB dumps when
 *     diagnosing a misencrypted row, which beats Base64-of-binary for ops.
 *
 * The 32-byte key is derived from `env.auth.mfaEncryptionKey` via SHA-256 so
 * any operator-supplied form (raw 32 bytes, 64-hex, base64, passphrase) ends
 * up as a 256-bit key without forcing a specific encoding contract on the env
 * variable. SHA-256 is NOT a KDF — but the env value is already a high-entropy
 * secret rotated together with the rest of the secret bundle, so a HKDF/Scrypt
 * step would only add complexity without strengthening the threat model
 * (matches `MEDIA_SIGNING_SECRET` derivation pattern).
 */

const IV_BYTES = 12;
const TAG_BYTES = 16;
const ALGORITHM = 'aes-256-gcm';

/** Derives a 256-bit key from the configured `MFA_ENCRYPTION_KEY` env value. */
const deriveKey = (rawKey: string): Buffer => {
  return createHash('sha256').update(rawKey, 'utf8').digest();
};

/**
 * Encrypts a TOTP shared secret. The IV is a fresh random 12 B per call so
 * encrypting the same secret twice still produces distinct ciphertexts —
 * required for GCM nonce uniqueness and exercised by the round-trip /
 * IV-uniqueness tests in `tests/unit/auth/totpEncryption.test.ts`.
 *
 * @param plaintext - The Base32 shared secret produced by `otpauth`/RFC 6238.
 * @returns Wire-format ciphertext suitable for `totp_secrets.secret_encrypted`.
 */
export function encryptTotpSecret(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const key = deriveKey(env.auth.mfaEncryptionKey);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${tag.toString('base64')}:${ciphertext.toString('base64')}`;
}

/**
 * Decrypts a wire-format ciphertext produced by {@link encryptTotpSecret}.
 *
 * Throws on:
 *   - malformed wire format (wrong number of segments / bad base64),
 *   - IV / tag length mismatch,
 *   - GCM auth tag mismatch (tamper detection — node crypto throws
 *     `'Unsupported state or unable to authenticate data'`).
 *
 * Callers MUST treat any throw as a security event: a row that fails to
 * decrypt is either corrupted at rest or has been tampered with, and the
 * affected user should be locked out of MFA-protected actions until the row
 * is re-issued via the enroll flow.
 *
 * @param wire - Stored ciphertext (`iv:tag:ct`, all base64).
 * @returns The original plaintext shared secret.
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
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ct), decipher.final()]);
  return plaintext.toString('utf8');
}
