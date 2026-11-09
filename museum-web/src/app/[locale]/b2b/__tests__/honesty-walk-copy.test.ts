import { describe, it, expect } from 'vitest';
import frDict from '@/dictionaries/fr.json';
import enDict from '@/dictionaries/en.json';

const FORBIDDEN_PRESENT_CLAIM_FR = [
  'déjà disponible',
  'disponible aujourd',
  'disponible aujourd’hui',
  'fonctionne déjà',
  'opérationnel aujourd',
  'prêt aujourd',
];

const FORBIDDEN_PRESENT_CLAIM_EN = [
  'available today',
  'available now',
  'ready today',
  'ready now',
  'shipping today',
  'shipping now',
  'works today',
];

const REQUIRED_INTENT_MARKER_FR = ['à venir', 'futur', 'pensé pour', 'conçu pour', 'demain'];
const REQUIRED_INTENT_MARKER_EN = [
  'designed for',
  'future-ready',
  'built for',
  'tomorrow',
  'upcoming',
];

function getFifthDifferentiator(dict: {
  landing?: { b2b?: { differentiators?: { title: string; description: string }[] } };
}): { title: string; description: string } {
  const arr = dict.landing?.b2b?.differentiators;
  expect(Array.isArray(arr), 'landing.b2b.differentiators must be an array').toBe(true);
  if (!arr) {
    throw new Error('unreachable — assertion above already failed');
  }
  expect(arr).toHaveLength(5);
  const fifth = arr[4];
  if (!fifth) throw new Error('unreachable — toHaveLength(5) already asserted');
  return fifth;
}

function containsAny(haystack: string, needles: string[]): boolean {
  const h = haystack.toLowerCase();
  return needles.some((n) => h.includes(n.toLowerCase()));
}

describe('Differentiator #5 honesty (R4 N5 / UFR-013)', () => {
  it('FR differentiator #5 does NOT make a present-tense Walk claim', () => {
    const fifth = getFifthDifferentiator(frDict as never);
    const blob = `${fifth.title} ${fifth.description}`;
    for (const phrase of FORBIDDEN_PRESENT_CLAIM_FR) {
      expect(blob.toLowerCase(), `FR differentiator #5 must not contain "${phrase}"`).not.toContain(
        phrase.toLowerCase(),
      );
    }
  });

  it('EN differentiator #5 does NOT make a present-tense Walk claim', () => {
    const fifth = getFifthDifferentiator(enDict as never);
    const blob = `${fifth.title} ${fifth.description}`;
    for (const phrase of FORBIDDEN_PRESENT_CLAIM_EN) {
      expect(blob.toLowerCase(), `EN differentiator #5 must not contain "${phrase}"`).not.toContain(
        phrase.toLowerCase(),
      );
    }
  });

  it('FR differentiator #5 contains at least one design-intent marker', () => {
    const fifth = getFifthDifferentiator(frDict as never);
    const blob = `${fifth.title} ${fifth.description}`;
    expect(
      containsAny(blob, REQUIRED_INTENT_MARKER_FR),
      `FR differentiator #5 must contain one of: ${REQUIRED_INTENT_MARKER_FR.join(', ')}`,
    ).toBe(true);
  });

  it('EN differentiator #5 contains at least one design-intent marker', () => {
    const fifth = getFifthDifferentiator(enDict as never);
    const blob = `${fifth.title} ${fifth.description}`;
    expect(
      containsAny(blob, REQUIRED_INTENT_MARKER_EN),
      `EN differentiator #5 must contain one of: ${REQUIRED_INTENT_MARKER_EN.join(', ')}`,
    ).toBe(true);
  });
});
