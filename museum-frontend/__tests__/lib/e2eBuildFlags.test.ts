/**
 * The `(dev)` route group must be reachable in an e2e RELEASE bundle and dead in a
 * shipped one. Getting this backwards has bitten the repo twice already:
 *  - the two modal-preview routes "passed green VACUOUSLY on the Release APK"
 *    (app/(dev)/_layout.tsx, stream H7);
 *  - `force-data-mode` then silently no-op'd for the four netshape flows, whose
 *    `low-data-badge` assertion could not pass on either platform.
 * These tests pin the contract of the flag that fixes it.
 */

/**
 * Re-evaluate the module against the CURRENT `process.env`. The flag is read at
 * module scope (Metro inlines it at bundle time), so each case needs a fresh
 * module registry — `require` inside `isolateModules`, not a dynamic `import`
 * (jest has no ESM VM modules enabled here).
 */
interface E2eBuildFlags {
  areE2eDevRoutesEnabled: () => boolean;
  areDevRoutesReachable: () => boolean;
}

const loadFlags = (): E2eBuildFlags => {
  let mod!: E2eBuildFlags;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- module-scope env read must be re-evaluated per case; dynamic import() needs --experimental-vm-modules
    mod = require('@/shared/lib/e2eBuildFlags') as E2eBuildFlags;
  });
  return mod;
};

describe('e2eBuildFlags', () => {
  const originalFlag = process.env.EXPO_PUBLIC_E2E_DEV_ROUTES;

  afterEach(() => {
    if (originalFlag === undefined) {
      delete process.env.EXPO_PUBLIC_E2E_DEV_ROUTES;
    } else {
      process.env.EXPO_PUBLIC_E2E_DEV_ROUTES = originalFlag;
    }
  });

  it('is OFF when the build carries no e2e flag — a shipped bundle can never reach the dev routes', () => {
    delete process.env.EXPO_PUBLIC_E2E_DEV_ROUTES;

    const { areE2eDevRoutesEnabled } = loadFlags();

    expect(areE2eDevRoutesEnabled()).toBe(false);
  });

  it('is ON when the Maestro build sets the flag', () => {
    process.env.EXPO_PUBLIC_E2E_DEV_ROUTES = 'true';

    const { areE2eDevRoutesEnabled } = loadFlags();

    expect(areE2eDevRoutesEnabled()).toBe(true);
  });

  it.each([['false'], ['0'], [''], ['yes'], ['1']])(
    'stays OFF for the non-canonical value %p — only the literal "true" opens the seam',
    (value) => {
      process.env.EXPO_PUBLIC_E2E_DEV_ROUTES = value;

      const { areE2eDevRoutesEnabled } = loadFlags();

      expect(areE2eDevRoutesEnabled()).toBe(false);
    },
  );

  it('reports the dev routes reachable whenever __DEV__ is on, flag or not', () => {
    delete process.env.EXPO_PUBLIC_E2E_DEV_ROUTES;

    const { areDevRoutesReachable } = loadFlags();

    // jest runs with __DEV__ === true, i.e. the ordinary developer loop.
    expect(areDevRoutesReachable()).toBe(true);
  });
});
