import { readEnvString } from '@/shared/lib/env';

/**
 * Build-time seam that keeps the `(dev)` route group reachable in a RELEASE
 * bundle — for e2e ONLY.
 *
 * Why this exists
 * ---------------
 * The `(dev)` group is gated on `__DEV__`. A Release bundle is built with
 * `--dev false`, so `__DEV__` is `false` and every `(dev)` route redirects Home.
 * That is correct for a shipped app — and fatal for the e2e suite, because the
 * Maestro flows drive those routes by deeplink and BOTH e2e binaries are Release
 * builds (iOS: `xcodebuild -configuration Release`; Android weak-net:
 * `./gradlew assembleRelease`). The four `netshape` flows deeplink
 * `musaium:///(dev)/force-data-mode`, which in a Release bundle silently
 * redirects: the low-data mode is never forced and the (non-optional)
 * `low-data-badge` assertion can never pass, on either platform.
 *
 * This is the exact trap `app/(dev)/_layout.tsx` already documents for the two
 * modal-preview routes that were deleted in 2026-06 — they "passed green
 * VACUOUSLY on the Release APK". `force-data-mode` was left behind.
 *
 * Why a build flag and not `__DEV__`
 * ----------------------------------
 * `__DEV__` conflates two different questions: "is this a dev build?" and "may
 * the e2e harness reach its seams?". Only the second one matters here. The flag
 * is inlined by Metro at bundle time (`EXPO_PUBLIC_*`), so it is a compile-time
 * constant: a bundle built without it cannot be talked into enabling these routes
 * at runtime.
 *
 * Safety
 * ------
 * It is set ONLY on the Maestro build jobs (`.github/workflows/ci-cd-mobile.yml`)
 * and never in any `.env`, `eas.json` profile, or release script — same contract
 * as `EXPO_PUBLIC_MAESTRO_AUDIO_FIXTURE`, the audio-fixture seam that already
 * ships this way. `scripts/sentinels/e2e-flags-not-in-env.mjs` fails the build if
 * it ever leaks into a checked-in env file.
 */
export const areE2eDevRoutesEnabled = (): boolean =>
  readEnvString(process.env.EXPO_PUBLIC_E2E_DEV_ROUTES)?.toLowerCase() === 'true';

/**
 * True when the `(dev)` route group must render: a normal dev build, or a Release
 * build explicitly produced for the e2e suite.
 */
export const areDevRoutesReachable = (): boolean => __DEV__ || areE2eDevRoutesEnabled();
