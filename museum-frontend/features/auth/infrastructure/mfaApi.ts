import { openApiRequest } from '@/shared/api/openapiClient';

import type { components, paths } from '@/shared/api/generated/openapi';

type Schemas = components['schemas'];

/** Login response — one of three shapes per R16 (see backend `LoginResponse`). */
export type LoginEnvelope =
  | Schemas['AuthSessionResponse']
  | Schemas['MfaRequiredResponse']
  | Schemas['MfaEnrollmentRequiredResponse'];

/** Type-narrowing predicates so callers can branch on the envelope shape. */
export const isMfaRequired = (payload: LoginEnvelope): payload is Schemas['MfaRequiredResponse'] =>
  'mfaRequired' in payload;

export const isMfaEnrollmentRequired = (
  payload: LoginEnvelope,
): payload is Schemas['MfaEnrollmentRequiredResponse'] => 'mfaEnrollmentRequired' in payload;

export const isAuthSession = (payload: LoginEnvelope): payload is Schemas['AuthSessionResponse'] =>
  !isMfaRequired(payload) && !isMfaEnrollmentRequired(payload);

/** Service grouping all MFA endpoints — typed against the regenerated OpenAPI. */
export const mfaService = {
  /** Start (or rotate) a TOTP enrollment for the authenticated user. */
  async enroll(): Promise<
    paths['/api/auth/mfa/enroll']['post']['responses'][200]['content']['application/json']
  > {
    return openApiRequest({
      path: '/api/auth/mfa/enroll',
      method: 'post',
    });
  },

  /** Confirm a freshly enrolled secret with a 6-digit code. */
  async verifyEnrollment(
    code: string,
  ): Promise<
    paths['/api/auth/mfa/enroll/verify']['post']['responses'][200]['content']['application/json']
  > {
    return openApiRequest({
      path: '/api/auth/mfa/enroll/verify',
      method: 'post',
      body: JSON.stringify({ code }),
    });
  },

  /** Exchange a `mfaSessionToken` + 6-digit code for a JWT pair. */
  async challenge(
    mfaSessionToken: string,
    code: string,
  ): Promise<
    paths['/api/auth/mfa/challenge']['post']['responses'][200]['content']['application/json']
  > {
    return openApiRequest({
      path: '/api/auth/mfa/challenge',
      method: 'post',
      body: JSON.stringify({ mfaSessionToken, code }),
      requiresAuth: false,
    });
  },

  /** Exchange `mfaSessionToken` + recovery code for a JWT pair (consumes the code). */
  async recovery(
    mfaSessionToken: string,
    recoveryCode: string,
  ): Promise<
    paths['/api/auth/mfa/recovery']['post']['responses'][200]['content']['application/json']
  > {
    return openApiRequest({
      path: '/api/auth/mfa/recovery',
      method: 'post',
      body: JSON.stringify({ mfaSessionToken, recoveryCode }),
      requiresAuth: false,
    });
  },

  /** Disable MFA after re-confirming the user's password. */
  async disable(
    currentPassword: string,
  ): Promise<
    paths['/api/auth/mfa/disable']['post']['responses'][200]['content']['application/json']
  > {
    return openApiRequest({
      path: '/api/auth/mfa/disable',
      method: 'post',
      body: JSON.stringify({ currentPassword }),
    });
  },
};
