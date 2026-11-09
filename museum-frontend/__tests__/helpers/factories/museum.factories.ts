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

export type LocalSearchEntry = MuseumSearchEntry & { id?: number };

export const makeMuseumBranding = (overrides?: Partial<MuseumBranding>): MuseumBranding => ({
  primaryColor: '#6B46C1',
  logoUrl: 'https://cdn.example.org/logo.png',
  ...overrides,
});

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

export interface GeoLocation {
  latitude: number;
  longitude: number;
}

export const makeGeoLocation = (overrides?: Partial<GeoLocation>): GeoLocation => ({
  latitude: faker.location.latitude(),
  longitude: faker.location.longitude(),
  ...overrides,
});

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
