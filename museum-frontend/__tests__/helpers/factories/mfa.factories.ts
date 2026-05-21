import { faker } from '@faker-js/faker';

import type { components } from '@/shared/api/generated/openapi';

type MfaEnrollResponse = components['schemas']['MfaEnrollResponse'];

/**
 * Creates an MfaEnrollResponse (otpauth URI + base32 manual secret + 10
 * one-time recovery codes) with sensible defaults.
 *
 * Used by MFA-enrollment screen tests. The shape mirrors the backend
 * `MfaEnrollResponse` schema. Recovery codes default to 10 entries to match
 * the "shown ONCE, 10 codes" enrollment contract.
 */
export const makeMfaEnrollResult = (overrides?: Partial<MfaEnrollResponse>): MfaEnrollResponse => {
  const manualSecret = faker.string.alphanumeric({ length: 32, casing: 'upper' });
  return {
    otpauthUrl: `otpauth://totp/Musaium:${faker.internet.email()}?secret=${manualSecret}&issuer=Musaium`,
    manualSecret,
    recoveryCodes: Array.from({ length: 10 }, () =>
      faker.string.alphanumeric({ length: 10, casing: 'lower' }),
    ),
    ...overrides,
  };
};
