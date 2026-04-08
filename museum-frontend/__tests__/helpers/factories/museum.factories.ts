import { faker } from '@faker-js/faker';

import type { components } from '@/shared/api/generated/openapi';

type MuseumDirectoryDTO = components['schemas']['MuseumDirectoryDTO'];

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
