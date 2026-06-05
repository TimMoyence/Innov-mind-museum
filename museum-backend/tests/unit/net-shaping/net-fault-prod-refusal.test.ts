/**
 * W2-07 (RED) — prod-refusal: middleware NOT mounted under production +
 * boot-throw when the flag is enabled in production.
 *
 * spec.md §EARS:
 *   R5 — WHEN NODE_ENV=production THE mw SHALL NEVER mount
 *        (`resolveNetFaultEnabled` coerces false unconditionally, NO hatch).
 *   R6 — WHEN NET_FAULT_INJECTION_ENABLED=true in production THE boot SHALL
 *        throw (validateProductionEnv), unconditionally.
 * design.md §Architecture: `shouldMountNetFault(nodeEnv, raw)` double-guards on
 *   `nodeEnv !== 'production' && resolveNetFaultEnabled(raw, nodeEnv)`;
 *   `validateProductionEnv` gains an unconditional throw (class of the
 *   AUTH_EMAIL_SERVICE_KIND='test' ban) when the flag is truthy in prod.
 *
 * RED state: `shouldMountNetFault` (in @src/config/net-fault.config) does not
 * exist yet, and `validateProductionEnv` does not yet throw on the flag → both
 * import + assertion fail.
 *
 * lib-docs: none — pure predicate + boot validator. Reuses the shared
 *   prod-env fixtures (`validProductionEnv`) — no inline test entities.
 *
 * Frozen-test invariant: byte-immutable once manifested (phase=green).
 */
import { shouldMountNetFault } from '@src/config/net-fault.config';
import { validateProductionEnv } from '@src/config/env.production-validation';
import type { AppEnv } from '@src/config/env.types';
import {
  VALID_CSRF_SECRET,
  VALID_EXPORT_PSEUDONYM_SALT,
  VALID_JWT_ACCESS_SECRET,
  VALID_JWT_REFRESH_SECRET,
  VALID_MEDIA_SIGNING_SECRET,
  VALID_MFA_ENCRYPTION_KEY,
  VALID_MFA_SESSION_TOKEN_SECRET,
} from '../../helpers/config/prod-env.fixtures';

describe('shouldMountNetFault — middleware mount gate (W2-07 / R5)', () => {
  let writeSpy: jest.SpyInstance;

  beforeEach(() => {
    writeSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    writeSpy.mockRestore();
  });

  it('mounts in development when the flag is enabled', () => {
    expect(shouldMountNetFault('true', 'development')).toBe(true);
    expect(shouldMountNetFault('1', 'test')).toBe(true);
  });

  it('does NOT mount in development when the flag is off (default)', () => {
    expect(shouldMountNetFault(undefined, 'development')).toBe(false);
    expect(shouldMountNetFault('false', 'test')).toBe(false);
  });

  it('NEVER mounts under production even when the flag is truthy — no escape hatch', () => {
    expect(shouldMountNetFault('true', 'production')).toBe(false);
    expect(shouldMountNetFault('1', 'production')).toBe(false);
    expect(shouldMountNetFault('yes', 'production')).toBe(false);
    expect(shouldMountNetFault('on', 'production')).toBe(false);
  });
});

const makeEnv = (): AppEnv =>
  ({
    nodeEnv: 'production',
    brevoApiKey: 'brevo',
    llm: { provider: 'openai', openAiApiKey: 'sk-openai' },
    storage: { driver: 'local', localUploadsDir: '/app/tmp/uploads', signedUrlTtlSeconds: 900 },
    exportPseudonymSalt: VALID_EXPORT_PSEUDONYM_SALT,
    auth: {
      accessTokenSecret: VALID_JWT_ACCESS_SECRET,
      refreshTokenSecret: VALID_JWT_REFRESH_SECRET,
      mfaEncryptionKey: VALID_MFA_ENCRYPTION_KEY,
      mfaSessionTokenSecret: VALID_MFA_SESSION_TOKEN_SECRET,
      csrfSecret: VALID_CSRF_SECRET,
      passwordBreachCheckEnabled: true,
      emailServiceKind: 'brevo',
    },
  }) as unknown as AppEnv;

describe('validateProductionEnv — net-fault flag boot-throw (W2-07 / R6)', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      PGDATABASE: 'museum_prod',
      CORS_ORIGINS: 'https://app.musaium.com',
      MEDIA_SIGNING_SECRET: VALID_MEDIA_SIGNING_SECRET,
      JWT_ACCESS_SECRET: VALID_JWT_ACCESS_SECRET,
      JWT_REFRESH_SECRET: VALID_JWT_REFRESH_SECRET,
      MFA_ENCRYPTION_KEY: VALID_MFA_ENCRYPTION_KEY,
      MFA_SESSION_TOKEN_SECRET: VALID_MFA_SESSION_TOKEN_SECRET,
      CSRF_SECRET: VALID_CSRF_SECRET,
      EXPORT_PSEUDONYM_SALT: VALID_EXPORT_PSEUDONYM_SALT,
      OPENAI_API_KEY: 'sk-openai',
    };
    delete process.env.JWT_SECRET;
    delete process.env.NET_FAULT_INJECTION_ENABLED;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('throws UNCONDITIONALLY when NET_FAULT_INJECTION_ENABLED=true in production', () => {
    process.env.NET_FAULT_INJECTION_ENABLED = 'true';
    expect(() => {
      validateProductionEnv(makeEnv());
    }).toThrow(/NET_FAULT_INJECTION_ENABLED/);
  });

  it('throws for any truthy flag form in production (1 / yes / on)', () => {
    for (const truthy of ['1', 'yes', 'on', 'TRUE']) {
      process.env.NET_FAULT_INJECTION_ENABLED = truthy;
      expect(() => {
        validateProductionEnv(makeEnv());
      }).toThrow(/NET_FAULT_INJECTION_ENABLED/);
    }
  });

  it('does NOT throw when the flag is absent in production (nominal prod boot)', () => {
    expect(() => {
      validateProductionEnv(makeEnv());
    }).not.toThrow();
  });

  it('does NOT throw when the flag is explicitly disabled in production', () => {
    process.env.NET_FAULT_INJECTION_ENABLED = 'false';
    expect(() => {
      validateProductionEnv(makeEnv());
    }).not.toThrow();
  });
});
