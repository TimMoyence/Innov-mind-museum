/**
 * RED test for QA-02 — the `chat.attachmentPicker.scan_cartel` label must stop
 * using the museum jargon "cartel" (incomprehensible to the general public) and
 * instead clearly indicate that the user scans the artwork's QR code.
 *
 * Source of truth: audit-state/2026-05-30-qa-manual/QA-NOTES.md § QA-02.
 * Product decision (Tim): FR value === "Scanner le QR de l'œuvre" (exact, with
 * the œ ligature — not the "oe" digraph). The 7 other locales keep best-effort
 * wording, but the QR/code-of-the-artwork CONCEPT must be preserved.
 *
 * Scope: ONLY the VALUE of the existing key `chat.attachmentPicker.scan_cartel`
 * changes across the 8 shipped locales (ar/de/en/es/fr/it/ja/zh). The key name
 * `scan_cartel` and the `attachment-picker-scan-cartel` testID stay unchanged
 * (accepted micro-debt — renaming = churn + Maestro breakage risk, out of scope).
 *
 * These assertions FAIL on the current shipped values
 *   fr "Scanner le cartel", en "Scan cartel", de "Schild scannen",
 *   es "Escanear cartela", it "Scansiona cartello", ja "解説をスキャン",
 *   zh "扫描说明牌", ar "مسح اللافتة"
 * and PASS once the values reference the QR code of the artwork.
 *
 * NOTE: this file deliberately does NOT re-assert the ≤30-char / no-emoji /
 * key-presence invariants — those are owned by `cartel-scanner-i18n.test.ts`
 * (R28-R31). This file covers ONLY the new copy semantics (QA-02), so it stays
 * orthogonal and does not duplicate the frozen i18n-coverage spec. It also does
 * NOT hard-pin the 7 non-FR strings (Green may pick shorter idiomatic wording to
 * stay ≤30 chars) — only the load-bearing QR concept + clean break are asserted.
 */

const LOCALES = ['ar', 'de', 'en', 'es', 'fr', 'it', 'ja', 'zh'] as const;
type Locale = (typeof LOCALES)[number];

// The museum-jargon strings shipped before the QA-02 fix. The new copy must be
// a clean break from every one of these (per-locale check below).
const OLD_VALUES: Record<Locale, string> = {
  fr: 'Scanner le cartel',
  en: 'Scan cartel',
  de: 'Schild scannen',
  es: 'Escanear cartela',
  it: 'Scansiona cartello',
  ja: '解説をスキャン',
  zh: '扫描说明牌',
  ar: 'مسح اللافتة',
};

const KEY = 'chat.attachmentPicker.scan_cartel';

function readLocale(locale: Locale): Record<string, unknown> {
  // Read the JSON file directly (NOT through the mocked react-i18next `t()`),
  // mirroring cartel-scanner-i18n.test.ts — we assert on the real shipped value.
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- direct JSON read of the shipped locale, matching cartel-scanner-i18n.test.ts. Approved-by: QA-02 red phase 2026-05-30
  return require(`@/shared/locales/${locale}/translation.json`) as Record<string, unknown>;
}

function getDeep(obj: Record<string, unknown>, dottedKey: string): string | undefined {
  const parts = dottedKey.split('.');
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return typeof cur === 'string' ? cur : undefined;
}

/**
 * Concept guard: the label must reference the QR code — either the ASCII token
 * "QR" (matches the Latin scripts AND the ja "作品のQRコードをスキャン" which embeds
 * ASCII "QR") or, for Chinese, the native QR word 二维码. This is the load-bearing
 * semantic the QA-02 fix must preserve in every locale regardless of the exact
 * phrasing Green chooses. NONE of the OLD museum-jargon values satisfy it, so it
 * discriminates: red on current values, green once the QR concept lands.
 */
function referencesQrCode(value: string): boolean {
  return /qr/i.test(value) || value.includes('二维码');
}

describe('QA-02 — scan_cartel label drops "cartel" jargon for the artwork QR code', () => {
  it('FR value is exactly the product-decided "Scanner le QR de l\'œuvre" (with œ ligature)', () => {
    const value = getDeep(readLocale('fr'), KEY);
    expect(value).toBe("Scanner le QR de l'œuvre");
  });

  it('FR value uses the real œ ligature, never the "oe" digraph', () => {
    const value = getDeep(readLocale('fr'), KEY) ?? '';
    expect(value).toContain('œuvre');
    // Guard against the lazy "oeuvre" spelling explicitly called out in the brief.
    expect(value.toLowerCase()).not.toContain('oeuvre');
  });

  describe.each(LOCALES)('locale=%s', (locale) => {
    it('no longer ships the old museum-jargon "cartel" wording', () => {
      const value = getDeep(readLocale(locale), KEY);
      expect(value).toBeDefined();
      expect(value).not.toBe(OLD_VALUES[locale]);
    });

    it('references the QR code of the artwork (QA-02 concept preserved)', () => {
      const value = getDeep(readLocale(locale), KEY) ?? '';
      expect(referencesQrCode(value)).toBe(true);
    });
  });
});
