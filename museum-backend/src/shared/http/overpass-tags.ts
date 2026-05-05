import type { MuseumCategory, OverpassElement, OverpassMuseumResult } from './overpass-types';

/** Extracts a formatted address string from OSM tags, or null if insufficient data. */
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

/** Maps an OSM `museum` tag value to a normalized category. */
export const classifyMuseumType = (tags: Record<string, string> | undefined): MuseumCategory => {
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

/**
 * Returns the first non-empty tag value among the given keys, or undefined.
 * Used to pick between primary OSM tags (`website`, `phone`) and their
 * `contact:*` namespaced counterparts.
 */
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

/**
 * Extracts optional descriptive tags (opening_hours, website, phone, image,
 * description, wheelchair) from a raw OSM element.
 *
 * Description prefers any localized variant present (`description:<lang>`)
 * over the bare `description` tag. The function does NOT pick a specific
 * locale because Overpass returns raw tags here — the calling layer can
 * still surface the bare `description` for UI without re-querying.
 */
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

/** Parses a single Overpass element into a museum result, or null if unusable. */
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
