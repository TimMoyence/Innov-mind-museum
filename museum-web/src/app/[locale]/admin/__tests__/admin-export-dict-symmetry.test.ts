/**
 * R2 RED — dictionary symmetry for `admin.export.*`.
 *
 * Pins R2 §3.8 + N12 down BEFORE implementation : every key under
 * `admin.export.{sessions,reviews,tickets}.{label,downloading,error}` MUST
 * exist in BOTH fr.json AND en.json (full parity).
 *
 * MUST FAIL at baseline `a77e48aa` — neither dict has the `admin.export`
 * namespace yet.
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

const KINDS = ['sessions', 'reviews', 'tickets'] as const;
const SUB_KEYS = ['label', 'downloading', 'error'] as const;

describe('Dictionary parity — admin.export.* (R2 §3.8 / N12)', () => {
  it('fr.json contains an admin.export namespace', () => {
    const fr = frDict as unknown as { admin?: { export?: unknown } };
    expect(fr.admin?.export).toBeDefined();
  });

  it('en.json contains an admin.export namespace', () => {
    const en = enDict as unknown as { admin?: { export?: unknown } };
    expect(en.admin?.export).toBeDefined();
  });

  it('admin.export key shape is identical between fr.json and en.json', () => {
    const fr = (frDict as unknown as { admin: { export: Json } }).admin.export;
    const en = (enDict as unknown as { admin: { export: Json } }).admin.export;
    expect(fr).toBeDefined();
    expect(en).toBeDefined();
    expect(shapeOf(en)).toEqual(shapeOf(fr));
  });

  for (const kind of KINDS) {
    for (const sub of SUB_KEYS) {
      it(`admin.export.${kind}.${sub} key exists in fr.json`, () => {
        const fr = (
          frDict as unknown as {
            admin: { export: Record<string, Record<string, unknown> | undefined> };
          }
        ).admin.export;
        expect(fr[kind]?.[sub]).toBeDefined();
        expect(typeof fr[kind]?.[sub]).toBe('string');
      });

      it(`admin.export.${kind}.${sub} key exists in en.json`, () => {
        const en = (
          enDict as unknown as {
            admin: { export: Record<string, Record<string, unknown> | undefined> };
          }
        ).admin.export;
        expect(en[kind]?.[sub]).toBeDefined();
        expect(typeof en[kind]?.[sub]).toBe('string');
      });
    }
  }
});
