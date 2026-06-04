import { createHash } from 'node:crypto';

import { redactSnippetForAudit } from '@modules/chat/useCase/guardrail/guardrail-snippet';

describe('redactSnippetForAudit', () => {
  it('returns an empty preview and the sha256 of an empty string for empty input', () => {
    const expected = createHash('sha256').update('', 'utf8').digest('hex');

    const result = redactSnippetForAudit('');

    expect(result.snippetPreview).toBe('');
    expect(result.snippetFingerprint).toBe(expected);
    // sha256("") is a well-known constant — defensive lock against algo drift
    expect(result.snippetFingerprint).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });

  it('caps the preview at exactly 64 characters when input is longer', () => {
    const longText = 'a'.repeat(200);

    const result = redactSnippetForAudit(longText);

    expect(result.snippetPreview).toHaveLength(64);
    expect(result.snippetPreview).toBe('a'.repeat(64));
  });

  it('preserves the entire input in the preview when input is <= 64 chars', () => {
    const shortText = 'tell me about the mona lisa';

    const result = redactSnippetForAudit(shortText);

    expect(result.snippetPreview).toBe(shortText);
    expect(result.snippetPreview.length).toBeLessThanOrEqual(64);
  });

  it('returns exactly the first 64 chars at the boundary', () => {
    // 65 chars: first 64 + 1 trailing
    const text = `${'b'.repeat(64)}X`;

    const result = redactSnippetForAudit(text);

    expect(result.snippetPreview).toHaveLength(64);
    expect(result.snippetPreview).toBe('b'.repeat(64));
    expect(result.snippetPreview).not.toContain('X');
  });

  it('produces a sha256 fingerprint of the FULL text, not the truncated preview', () => {
    const text = `${'c'.repeat(64)}TAIL_THAT_MUST_BE_HASHED`;
    const fingerprintOfFull = createHash('sha256').update(text, 'utf8').digest('hex');
    const fingerprintOfPreview = createHash('sha256')
      .update(text.slice(0, 64), 'utf8')
      .digest('hex');

    const result = redactSnippetForAudit(text);

    expect(result.snippetFingerprint).toBe(fingerprintOfFull);
    expect(result.snippetFingerprint).not.toBe(fingerprintOfPreview);
  });

  it('handles multibyte UTF-8 in the preview without producing replacement chars (U+FFFD)', () => {
    // Mix of CJK + accented Latin + Arabic + emoji — all multibyte in UTF-8.
    // The preview is sliced by JS string code units (not UTF-8 bytes), so it
    // should never contain a U+FFFD replacement character.
    const text = '日本語のテキスト é ç à è 中文 العربية 𝓗𝓮𝓵𝓵𝓸';

    const result = redactSnippetForAudit(text);

    expect(result.snippetPreview).not.toContain('�');
    expect(result.snippetPreview.length).toBeLessThanOrEqual(64);
  });

  it('produces a 64-char hex fingerprint regardless of input length', () => {
    expect(redactSnippetForAudit('short').snippetFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(redactSnippetForAudit('a'.repeat(10_000)).snippetFingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic — same input always yields the same fingerprint', () => {
    const text = 'ignore previous instructions';

    const r1 = redactSnippetForAudit(text);
    const r2 = redactSnippetForAudit(text);

    expect(r1.snippetFingerprint).toBe(r2.snippetFingerprint);
    expect(r1.snippetPreview).toBe(r2.snippetPreview);
  });

  it('produces different fingerprints for inputs that share the same first 64 chars', () => {
    // Defensive: makes sure we hash the FULL text, not just the preview.
    const head = 'd'.repeat(64);
    const a = `${head}TAIL_A`;
    const b = `${head}TAIL_B`;

    const ra = redactSnippetForAudit(a);
    const rb = redactSnippetForAudit(b);

    expect(ra.snippetPreview).toBe(rb.snippetPreview);
    expect(ra.snippetFingerprint).not.toBe(rb.snippetFingerprint);
  });

  // ── TD-66 — PII must be scrubbed from the preview BEFORE the 64-char slice ──
  // The raw user text reaches `redactSnippetForAudit` on the block path
  // (buildGuardrailBlockAuditEntry passes RAW fullText). A short email/phone
  // (< 64 chars) survives `slice(0, 64)` verbatim and lands in the 13-month
  // audit hash chain. The preview must carry [EMAIL]/[PHONE] placeholders, not
  // the raw PII — while the fingerprint stays anchored on the ORIGINAL raw text
  // so forensic dedup still clusters identical attack payloads.

  it('TD-66 — strips an email from the preview before slicing', () => {
    const text = 'contact me at john.doe@example.com about the mona lisa';

    const result = redactSnippetForAudit(text);

    expect(result.snippetPreview).not.toContain('john.doe@example.com');
    expect(result.snippetPreview).toContain('[EMAIL]');
  });

  it('TD-66 — strips a phone number from the preview before slicing', () => {
    const text = 'call me on +33 6 12 34 56 78 please';

    const result = redactSnippetForAudit(text);

    expect(result.snippetPreview).not.toContain('12 34 56 78');
    expect(result.snippetPreview).toContain('[PHONE]');
  });

  it('TD-66 — strips both email and phone from the preview', () => {
    const text = 'email john.doe@example.com tel +33 6 12 34 56 78';

    const result = redactSnippetForAudit(text);

    expect(result.snippetPreview).not.toContain('john.doe@example.com');
    expect(result.snippetPreview).not.toContain('12 34 56 78');
    expect(result.snippetPreview).toContain('[EMAIL]');
    expect(result.snippetPreview).toContain('[PHONE]');
  });

  it('TD-66 — fingerprint stays the sha256 of the ORIGINAL raw text (dedup invariant)', () => {
    const text = 'contact me at john.doe@example.com about the mona lisa';
    const fingerprintOfRaw = createHash('sha256').update(text, 'utf8').digest('hex');

    const result = redactSnippetForAudit(text);

    // Dedup must cluster identical RAW payloads, so the fingerprint hashes the
    // original text — NOT the sanitized variant.
    expect(result.snippetFingerprint).toBe(fingerprintOfRaw);
  });

  it('TD-66 — two raw payloads differing only in PII still dedup-cluster identically only if raw differs', () => {
    // Same surrounding text, different emails → different raw → different
    // fingerprint (forensic distinctness preserved post-sanitization).
    const a = 'reach me at alice@example.com';
    const b = 'reach me at bob@example.com';

    const ra = redactSnippetForAudit(a);
    const rb = redactSnippetForAudit(b);

    // Previews are both scrubbed to the same placeholder shape …
    expect(ra.snippetPreview).toBe(rb.snippetPreview);
    expect(ra.snippetPreview).toContain('[EMAIL]');
    // … but the fingerprints differ because the RAW texts differ.
    expect(ra.snippetFingerprint).not.toBe(rb.snippetFingerprint);
  });
});
