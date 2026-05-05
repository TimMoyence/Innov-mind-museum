import {
  classifyMuseumType,
  extractAddress,
  extractOptionalTags,
  parseElement,
  pickTag,
} from '@shared/http/overpass-tags';

describe('overpass-tags', () => {
  describe('extractAddress', () => {
    it('returns null when tags is undefined', () => {
      expect(extractAddress(undefined)).toBeNull();
    });

    it('joins housenumber + street + city when all present', () => {
      expect(
        extractAddress({
          'addr:housenumber': '12',
          'addr:street': 'Rue de Rivoli',
          'addr:city': 'Paris',
        }),
      ).toBe('12 Rue de Rivoli, Paris');
    });

    it('omits housenumber when only street is present', () => {
      expect(extractAddress({ 'addr:street': 'Place du Carrousel' })).toBe('Place du Carrousel');
    });

    it('returns null when no address fields', () => {
      expect(extractAddress({ name: 'Louvre' })).toBeNull();
    });
  });

  describe('classifyMuseumType', () => {
    it.each([
      [{ museum: 'art' }, 'art'],
      [{ museum: 'modern_art' }, 'art'],
      [{ subject: 'history' }, 'history'],
      [{ museum: 'natural_history' }, 'science'],
      [{ museum: 'aviation' }, 'specialized'],
      [{ museum: 'other' }, 'general'],
      [{}, 'general'],
      [undefined, 'general'],
    ])('classifies %j as %s', (tags, expected) => {
      expect(classifyMuseumType(tags)).toBe(expected);
    });
  });

  describe('pickTag', () => {
    it('returns first non-empty value among keys', () => {
      expect(pickTag({ phone: '', 'contact:phone': '+33-1' }, ['phone', 'contact:phone'])).toBe(
        '+33-1',
      );
    });

    it('returns undefined when no key matches', () => {
      expect(pickTag({}, ['phone'])).toBeUndefined();
    });

    it('returns undefined for undefined tags', () => {
      expect(pickTag(undefined, ['phone'])).toBeUndefined();
    });
  });

  describe('extractOptionalTags', () => {
    it('prefers localized description over bare description', () => {
      const out = extractOptionalTags({
        description: 'Bare description',
        'description:fr': 'Description française',
      });
      expect(out.description).toBe('Description française');
    });

    it('falls back to bare description when no localized variant', () => {
      const out = extractOptionalTags({ description: 'Bare description' });
      expect(out.description).toBe('Bare description');
    });

    it('returns empty object for undefined tags', () => {
      expect(extractOptionalTags(undefined)).toEqual({});
    });
  });

  describe('parseElement', () => {
    it('parses a node element with explicit lat/lon', () => {
      const result = parseElement({
        type: 'node',
        id: 1,
        lat: 48.86,
        lon: 2.34,
        tags: { name: 'Louvre', tourism: 'museum', museum: 'art' },
      });
      expect(result).toMatchObject({
        name: 'Louvre',
        latitude: 48.86,
        longitude: 2.34,
        osmId: 1,
        museumType: 'art',
      });
    });

    it('uses the center for way/relation elements', () => {
      const result = parseElement({
        type: 'way',
        id: 2,
        center: { lat: 48.85, lon: 2.35 },
        tags: { name: 'Orsay' },
      });
      expect(result?.latitude).toBe(48.85);
      expect(result?.longitude).toBe(2.35);
    });

    it('returns null when name tag missing', () => {
      expect(parseElement({ type: 'node', id: 3, lat: 0, lon: 0 })).toBeNull();
    });

    it('returns null when coordinates missing on way without center', () => {
      expect(parseElement({ type: 'way', id: 4, tags: { name: 'Anonymous' } })).toBeNull();
    });
  });
});
