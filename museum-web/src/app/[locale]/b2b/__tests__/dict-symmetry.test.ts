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

describe('Dictionary parity — landing.b2b.* (R4 R15 / AC4)', () => {
  it('fr.json contains a landing.b2b namespace', () => {
    const fr = frDict as unknown as { landing?: { b2b?: unknown } };
    expect(fr.landing?.b2b).toBeDefined();
  });

  it('en.json contains a landing.b2b namespace', () => {
    const en = enDict as unknown as { landing?: { b2b?: unknown } };
    expect(en.landing?.b2b).toBeDefined();
  });

  it('landing.b2b key shape is identical between fr.json and en.json', () => {
    const fr = (frDict as unknown as { landing: { b2b: Json } }).landing.b2b;
    const en = (enDict as unknown as { landing: { b2b: Json } }).landing.b2b;
    expect(
      fr,
      'fr.json:landing.b2b must be defined for the parity test to be meaningful',
    ).toBeDefined();
    expect(
      en,
      'en.json:landing.b2b must be defined for the parity test to be meaningful',
    ).toBeDefined();
    expect(shapeOf(en)).toEqual(shapeOf(fr));
  });

  it('landing.b2b.differentiators has length 5 in both locales (R3)', () => {
    const fr = (frDict as unknown as { landing: { b2b: { differentiators: unknown[] } } }).landing
      .b2b.differentiators;
    const en = (enDict as unknown as { landing: { b2b: { differentiators: unknown[] } } }).landing
      .b2b.differentiators;
    expect(Array.isArray(fr)).toBe(true);
    expect(Array.isArray(en)).toBe(true);
    expect(fr).toHaveLength(5);
    expect(en).toHaveLength(5);
  });

  it('footer.links.b2b key exists in both locales (R18 / AC11)', () => {
    const fr = (frDict as unknown as { footer: { links: Record<string, unknown> } }).footer.links;
    const en = (enDict as unknown as { footer: { links: Record<string, unknown> } }).footer.links;
    expect(fr.b2b).toBeDefined();
    expect(typeof fr.b2b).toBe('string');
    expect(en.b2b).toBeDefined();
    expect(typeof en.b2b).toBe('string');
  });
});
