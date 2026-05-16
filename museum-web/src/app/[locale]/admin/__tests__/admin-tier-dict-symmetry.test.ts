/**
 * R1 RED — dictionary symmetry for `admin.userDetailPage.tier.*` (T1.15 — L in brief).
 *
 * Pins R1 §0.3 web + N8 + AC7 down BEFORE implementation : every key under
 * `admin.userDetailPage.tier.{label, currentFree, currentPremium,
 * toggleToPremium, toggleToFree, confirmTitle, confirmBody, confirmCta,
 * cancel, success, error}` MUST exist in BOTH `fr.json` AND `en.json`
 * (full parity, identical key shape).
 *
 * MUST FAIL at baseline `cd7e22bc` — neither dict has the
 * `admin.userDetailPage.tier` subtree yet. Mirrors the R2
 * `admin-export-dict-symmetry.test.ts` pattern verbatim.
 */
import { describe, it, expect } from 'vitest';
import frDict from '@/dictionaries/fr.json';
import enDict from '@/dictionaries/en.json';

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

function shapeOf(value: Json): unknown {
  if (Array.isArray(value)) {
    return {
      __kind: 'array',
      length: value.length,
      itemShape: value.length > 0 ? shapeOf(value[0] as Json) : null,
    };
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value).sort()) {
      out[k] = shapeOf((value as Record<string, Json>)[k] as Json);
    }
    return out;
  }
  return typeof value;
}

const TIER_KEYS = [
  'label',
  'currentFree',
  'currentPremium',
  'toggleToPremium',
  'toggleToFree',
  'confirmTitle',
  'confirmBody',
  'confirmCta',
  'cancel',
  'success',
  'error',
] as const;

interface DictShape {
  admin?: {
    userDetailPage?: {
      tier?: Record<string, unknown>;
    };
  };
}

describe('Dictionary parity — admin.userDetailPage.tier.* (R1 §0.3 web / N8)', () => {
  it('fr.json contains an admin.userDetailPage.tier subtree', () => {
    const fr = frDict as unknown as DictShape;
    expect(fr.admin?.userDetailPage?.tier).toBeDefined();
  });

  it('en.json contains an admin.userDetailPage.tier subtree', () => {
    const en = enDict as unknown as DictShape;
    expect(en.admin?.userDetailPage?.tier).toBeDefined();
  });

  it('tier key shape is identical between fr.json and en.json', () => {
    const fr = (frDict as unknown as DictShape).admin?.userDetailPage?.tier as Json | undefined;
    const en = (enDict as unknown as DictShape).admin?.userDetailPage?.tier as Json | undefined;
    expect(fr).toBeDefined();
    expect(en).toBeDefined();
    expect(shapeOf(en as Json)).toEqual(shapeOf(fr as Json));
  });

  for (const key of TIER_KEYS) {
    it(`admin.userDetailPage.tier.${key} exists in fr.json (non-empty string)`, () => {
      const fr = (frDict as unknown as DictShape).admin?.userDetailPage?.tier;
      expect(fr?.[key]).toBeDefined();
      expect(typeof fr?.[key]).toBe('string');
      expect(((fr?.[key] as string | undefined) ?? '').length).toBeGreaterThan(0);
    });

    it(`admin.userDetailPage.tier.${key} exists in en.json (non-empty string)`, () => {
      const en = (enDict as unknown as DictShape).admin?.userDetailPage?.tier;
      expect(en?.[key]).toBeDefined();
      expect(typeof en?.[key]).toBe('string');
      expect(((en?.[key] as string | undefined) ?? '').length).toBeGreaterThan(0);
    });
  }
});
