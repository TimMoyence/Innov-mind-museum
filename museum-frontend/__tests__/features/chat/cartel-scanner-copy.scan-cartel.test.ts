const LOCALES = ['ar', 'de', 'en', 'es', 'fr', 'it', 'ja', 'zh'] as const;
type Locale = (typeof LOCALES)[number];

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
