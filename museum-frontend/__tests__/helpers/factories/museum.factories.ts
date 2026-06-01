import { faker } from '@faker-js/faker';

import type { components } from '@/shared/api/generated/openapi';
import type { MuseumWithDistance } from '@/features/museum/application/useMuseumDirectory';
import type { MuseumBranding } from '@/features/museum/domain/museum-branding';
import type {
  MuseumEnrichmentView,
  MuseumSearchEntry,
} from '@/features/museum/infrastructure/museumApi';

type MuseumDirectoryDTO = components['schemas']['MuseumDirectoryDTO'];
type MuseumDTO = components['schemas']['MuseumDTO'];

/**
 * A `source:'local'` search entry carries its originating DB `Museum.id`.
 * The generated `MuseumSearchEntry` will surface `id?: number` after the
 * OpenAPI regen (run 2026-06-01-museum-picker-osm-select); the intersection
 * keeps this factory typed both before and after that regen.
 */
export type LocalSearchEntry = MuseumSearchEntry & { id?: number };

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

/**
 * Creates a {@link MuseumEnrichmentView} (projection from
 * `GET /api/museums/:id/enrichment`) with everything-empty defaults: base +
 * the four rich JSONB fields all `null`. Pass overrides to populate specific
 * sections — e.g. `makeMuseumEnrichmentView({ admissionFees: { adult: '6 €' } })`.
 *
 * QA-06: the four rich fields (`admissionFees`, `collections`,
 * `currentExhibitions`, `accessibility`) are nullable `Record<string, unknown>`
 * — no field shape is guaranteed by the backend Zod schemas.
 */
export const makeMuseumEnrichmentView = (
  overrides?: Partial<MuseumEnrichmentView>,
): MuseumEnrichmentView => ({
  museumId: faker.number.int({ min: 1, max: 1000 }),
  locale: 'en',
  summary: null,
  wikidataQid: null,
  website: null,
  phone: null,
  imageUrl: null,
  openingHours: null,
  admissionFees: null,
  collections: null,
  currentExhibitions: null,
  accessibility: null,
  fetchedAt: '2026-05-30T08:00:00.000Z',
  ...overrides,
});

/**
 * Creates a `source:'local'` {@link MuseumSearchEntry} (a museum backed by a DB
 * row, hence carrying an integer `id`). Defaults: id 7, Paris-ish coords. Pass
 * `{ id }` to control the DB primary key the picker maps to `museumId`.
 */
export const makeSearchEntryLocal = (overrides?: Partial<LocalSearchEntry>): LocalSearchEntry => ({
  id: 7,
  name: 'Louvre',
  address: '75001 Paris',
  latitude: 48.8606,
  longitude: 2.3376,
  distance: 50,
  source: 'local',
  museumType: 'art',
  ...overrides,
});

/**
 * Creates a `source:'osm'` {@link MuseumSearchEntry} (an OpenStreetMap POI with
 * NO DB row → no `id`). The picker must keep this selectable (kind 'osm',
 * identified by name + coordinates). Defaults: a Bordeaux monument-ish POI.
 */
export const makeSearchEntryOsm = (overrides?: Partial<MuseumSearchEntry>): MuseumSearchEntry => ({
  name: 'Pont de Pierre',
  address: null,
  latitude: 44.8378,
  longitude: -0.5639,
  distance: 320,
  source: 'osm',
  museumType: 'general',
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
