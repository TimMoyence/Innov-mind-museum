/**
 * R3 RED — dictionary symmetry test for `landing.beta.*`.
 *
 * Pins R3 §1 R18 + AC4 down BEFORE implementation: every key under
 * `landing.beta.*` MUST exist in BOTH fr.json AND en.json (full parity), and
 * the "check inbox" honesty key (`success`) is present (N5 + UFR-013).
 *
 * MUST FAIL at baseline `d5919dd3` — neither dictionary has the `beta`
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

const REQUIRED_KEYS = [
  'heading',
  'subheading',
  'fieldEmail',
  'fieldConsent',
  'consentPrivacyLink',
  'submit',
  'sending',
  'success',
  'error',
] as const;

describe('Dictionary parity — landing.beta.* (R3 R18 / AC4)', () => {
  it('fr.json contains a landing.beta namespace', () => {
    const fr = frDict as unknown as { landing?: { beta?: unknown } };
    expect(fr.landing?.beta).toBeDefined();
  });

  it('en.json contains a landing.beta namespace', () => {
    const en = enDict as unknown as { landing?: { beta?: unknown } };
    expect(en.landing?.beta).toBeDefined();
  });

  it('landing.beta key shape is identical between fr.json and en.json', () => {
    const fr = (frDict as unknown as { landing: { beta: Json } }).landing.beta;
    const en = (enDict as unknown as { landing: { beta: Json } }).landing.beta;
    expect(fr, 'fr.json:landing.beta must be defined for the parity test').toBeDefined();
    expect(en, 'en.json:landing.beta must be defined for the parity test').toBeDefined();
    expect(shapeOf(en)).toEqual(shapeOf(fr));
  });

  it.each(REQUIRED_KEYS)('landing.beta.%s key exists in fr.json', (key) => {
    const fr = (frDict as unknown as { landing: { beta: Record<string, unknown> } }).landing.beta;
    expect(fr[key]).toBeDefined();
    expect(typeof fr[key]).toBe('string');
  });

  it.each(REQUIRED_KEYS)('landing.beta.%s key exists in en.json', (key) => {
    const en = (enDict as unknown as { landing: { beta: Record<string, unknown> } }).landing.beta;
    expect(en[key]).toBeDefined();
    expect(typeof en[key]).toBe('string');
  });

  it('landing.beta.success in EN mentions confirmation email (N5 honesty UFR-013)', () => {
    // R3 N5 + spec §3.5 — the success copy MUST be honest about Brevo's
    // double-opt-in step. The user will receive a confirmation email next.
    const en = (enDict as unknown as { landing: { beta: { success: string } } }).landing.beta
      .success;
    expect(en.toLowerCase()).toMatch(/confirm/);
  });

  it('landing.beta.success in FR mentions confirmation email (N5 honesty UFR-013)', () => {
    const fr = (frDict as unknown as { landing: { beta: { success: string } } }).landing.beta
      .success;
    expect(fr.toLowerCase()).toMatch(/confirm/);
  });
});

describe('Footer is NOT modified by R3 (scope OUT)', () => {
  it('footer.links does NOT add a `beta` entry (only b2b from R4)', () => {
    // R3 explicitly does NOT add a Footer link (spec §0.4 scope OUT). The
    // only landing-related Footer link is `b2b` shipped by R4.
    const fr = (frDict as unknown as { footer: { links: Record<string, unknown> } }).footer.links;
    const en = (enDict as unknown as { footer: { links: Record<string, unknown> } }).footer.links;
    expect(fr).not.toHaveProperty('beta');
    expect(en).not.toHaveProperty('beta');
  });
});
