/**
 * Red tests for B4 — i18n coverage of the 12 new cartel-scanner keys across
 * the 8 shipped locales (ar/de/en/es/fr/it/ja/zh).
 *
 * Validates:
 *   - every locale contains all 12 keys (R28, AC26)
 *   - no Unicode emoji anywhere in the new strings (R29, AC27)
 *   - `lookup_template` contains exactly one `{{code}}` placeholder (R30, AC28)
 *   - `chat.attachmentPicker.scan_cartel` is ≤ 30 chars (R31, AC29)
 *
 * Spec: docs/chat-ux-refonte/specs/B4.md §0.9 + §1.7, AC26-AC29.
 */

import '../../helpers/test-utils';

const LOCALES = ['ar', 'de', 'en', 'es', 'fr', 'it', 'ja', 'zh'] as const;

const CARTEL_SCANNER_KEYS = [
  'chat.cartelScanner.title',
  'chat.cartelScanner.instructions',
  'chat.cartelScanner.permission_title',
  'chat.cartelScanner.permission_body',
  'chat.cartelScanner.permission_open_settings',
  'chat.cartelScanner.cancel',
  'chat.cartelScanner.lookup_template',
  'chat.attachmentPicker.scan_cartel',
  'a11y.cartelScanner.opened',
  'a11y.cartelScanner.scan_success',
  'a11y.cartelScanner.viewfinder_hint',
  'a11y.cartelScanner.cancel_hint',
] as const;

// Forbid the visible-symbol emoji ranges plus the dingbat / pictograph block.
// Cohérent A1/A2/A5/A6/B3/B5 regex.
const EMOJI_RE = /[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}]/u;

function readLocale(locale: string): Record<string, unknown> {
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

describe('B4 — cartel-scanner i18n coverage (AC26)', () => {
  describe.each(LOCALES)('locale=%s', (locale) => {
    const dict = readLocale(locale);

    it.each(CARTEL_SCANNER_KEYS)('contains the key %s', (key) => {
      const value = getDeep(dict, key);
      expect(value).toBeDefined();
      expect(typeof value).toBe('string');
      expect((value ?? '').length).toBeGreaterThan(0);
    });

    it('contains zero Unicode emoji in any of the 12 new keys (R29, AC27)', () => {
      for (const key of CARTEL_SCANNER_KEYS) {
        const value = getDeep(dict, key);
        if (value === undefined) continue;
        expect(value).not.toMatch(EMOJI_RE);
      }
    });

    it('lookup_template contains exactly one {{code}} placeholder (R30, AC28)', () => {
      const tmpl = getDeep(dict, 'chat.cartelScanner.lookup_template');
      expect(tmpl).toBeDefined();
      const matches = (tmpl ?? '').match(/\{\{code\}\}/g) ?? [];
      expect(matches.length).toBe(1);
    });

    it('scan_cartel label is ≤ 30 characters (R31, AC29)', () => {
      const label = getDeep(dict, 'chat.attachmentPicker.scan_cartel');
      expect(label).toBeDefined();
      expect((label ?? '').length).toBeLessThanOrEqual(30);
    });
  });
});
