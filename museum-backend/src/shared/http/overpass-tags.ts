import type { MuseumCategory, OverpassElement, OverpassMuseumResult } from './overpass-types';

export const extractAddress = (tags: Record<string, string> | undefined): string | null => {
  if (!tags) return null;

  const parts: string[] = [];

  const street = tags['addr:street'];
  const houseNumber = tags['addr:housenumber'];
  if (street) {
    parts.push(houseNumber ? `${houseNumber} ${street}` : street);
  }

  const city = tags['addr:city'];
  if (city) {
    parts.push(city);
  }

  return parts.length > 0 ? parts.join(', ') : null;
};

export const classifyMuseumType = (tags: Record<string, string> | undefined): MuseumCategory => {
  // Stryker disable next-line StringLiteral: the fallback value is unobservable — any non-matching string lowercases to a value that fails every includes() check below and yields 'general'.
  const raw = tags?.museum ?? tags?.subject ?? '';
  const lower = raw.toLowerCase();

  if (['art', 'arts', 'fine_arts', 'modern_art', 'contemporary_art'].includes(lower)) return 'art';
  if (['history', 'archaeology', 'archaeological', 'local_history', 'ethnography'].includes(lower))
    return 'history';
  if (['science', 'technology', 'natural_history', 'natural', 'nature', 'geology'].includes(lower))
    return 'science';
  if (
    [
      'railway',
      'aviation',
      'maritime',
      'military',
      'transport',
      'industrial',
      'automobile',
    ].includes(lower)
  )
    return 'specialized';

  return 'general';
};

/** First non-empty tag value. Used to fallback `website`→`contact:website`, etc. */
export const pickTag = (
  tags: Record<string, string> | undefined,
  keys: readonly string[],
): string | undefined => {
  if (!tags) return undefined;
  for (const key of keys) {
    const value = tags[key];
    if (value && value.trim().length > 0) return value;
  }
  return undefined;
};

/** Prefers any localized `description:<lang>` over bare `description` (locale-agnostic). */
export const extractOptionalTags = (
  tags: Record<string, string> | undefined,
): Pick<
  OverpassMuseumResult,
  'openingHours' | 'website' | 'phone' | 'imageUrl' | 'description' | 'wheelchair'
> => {
  if (!tags) return {};

  const localizedDescription = Object.entries(tags).find(
    ([k, v]) => k.startsWith('description:') && v.trim().length > 0,
  )?.[1];

  return {
    openingHours: pickTag(tags, ['opening_hours']),
    website: pickTag(tags, ['website', 'contact:website', 'url']),
    phone: pickTag(tags, ['phone', 'contact:phone']),
    imageUrl: pickTag(tags, ['image']),
    description: localizedDescription ?? pickTag(tags, ['description']),
    wheelchair: pickTag(tags, ['wheelchair']),
  };
};

export const parseElement = (el: OverpassElement): OverpassMuseumResult | null => {
  const name = el.tags?.name;
  if (!name) return null;

  let latitude: number | undefined;
  let longitude: number | undefined;

  if (el.type === 'node') {
    latitude = el.lat;
    longitude = el.lon;
  } else {
    latitude = el.center?.lat;
    longitude = el.center?.lon;
  }

  if (latitude === undefined || longitude === undefined) return null;

  return {
    name,
    address: extractAddress(el.tags),
    latitude,
    longitude,
    osmId: el.id,
    museumType: classifyMuseumType(el.tags),
    ...extractOptionalTags(el.tags),
  };
};
