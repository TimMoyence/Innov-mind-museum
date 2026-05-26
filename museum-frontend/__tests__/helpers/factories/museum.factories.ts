import { faker } from '@faker-js/faker';

import type { components } from '@/shared/api/generated/openapi';
import type { MuseumWithDistance } from '@/features/museum/application/useMuseumDirectory';
import type { MuseumBranding } from '@/features/museum/domain/museum-branding';

type MuseumDirectoryDTO = components['schemas']['MuseumDirectoryDTO'];
type MuseumDTO = components['schemas']['MuseumDTO'];

/**
 * Creates a {@link MuseumBranding} (per-museum co-branding slice) with valid
 * defaults: a `#RRGGBB` primary color + an HTTPS logo URL.
 *
 * NOTE (C4 slice, dispatcher override): only `primaryColor` + `logoUrl` are
 * parsed/consumed. There is no `secondary`/`accent` theme channel in
 * `ThemePalette` (0 consumers), so parsing them would be dead code — they are
 * deliberately omitted from the mobile `MuseumBranding` shape.
 */
export const makeMuseumBranding = (overrides?: Partial<MuseumBranding>): MuseumBranding => ({
  primaryColor: '#6B46C1',
  logoUrl: 'https://cdn.example.org/logo.png',
  ...overrides,
});

/**
 * Creates a {@link MuseumDTO} (single-museum shape from
 * `GET /api/museums/{idOrSlug}`) with sensible defaults. `config` defaults to
 * `{}` (unbranded — mirrors the 3 Bordeaux demo seeds). Pass
 * `{ config: { branding: makeMuseumBranding() } }` to exercise the branded path.
 */
export const makeMuseumDetail = (overrides?: Partial<MuseumDTO>): MuseumDTO => ({
  id: faker.number.int({ min: 1, max: 1000 }),
  name: faker.company.name(),
  slug: faker.helpers.slugify(faker.company.name()).toLowerCase(),
  address: faker.location.streetAddress(),
  description: faker.lorem.sentence(),
  latitude: faker.location.latitude(),
  longitude: faker.location.longitude(),
  museumType: 'art',
  config: {},
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

/** Creates a MuseumDirectoryDTO (public museum list item) with sensible defaults. */
export const makeMuseumListItem = (
  overrides?: Partial<MuseumDirectoryDTO>,
): MuseumDirectoryDTO => ({
  id: faker.number.int({ min: 1, max: 1000 }),
  name: faker.company.name(),
  slug: faker.helpers.slugify(faker.company.name()).toLowerCase(),
  address: faker.location.streetAddress(),
  description: faker.lorem.sentence(),
  latitude: faker.location.latitude(),
  longitude: faker.location.longitude(),
  museumType: 'art',
  ...overrides,
});

/** A simple geo-coordinate pair for distance/location tests. */
export interface GeoLocation {
  latitude: number;
  longitude: number;
}

/** Creates a GeoLocation with sensible defaults. */
export const makeGeoLocation = (overrides?: Partial<GeoLocation>): GeoLocation => ({
  latitude: faker.location.latitude(),
  longitude: faker.location.longitude(),
  ...overrides,
});

/** Creates a MuseumWithDistance (museum list item + distance/source) with sensible defaults. */
export const makeMuseumWithDistance = (
  overrides?: Partial<MuseumWithDistance>,
): MuseumWithDistance => ({
  id: faker.number.int({ min: 1, max: 1000 }),
  name: faker.company.name(),
  slug: faker.helpers.slugify(faker.company.name()).toLowerCase(),
  address: faker.location.streetAddress(),
  description: faker.lorem.sentence(),
  latitude: faker.location.latitude(),
  longitude: faker.location.longitude(),
  museumType: 'general',
  distanceMeters: 1_200,
  source: 'local',
  ...overrides,
});
