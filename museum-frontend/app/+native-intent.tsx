import { mapMagicLinkPath } from '@/features/auth/lib/magicLinkPath';

/**
 * Expo Router native-intent hook (TD-RNAV-01 cycle 2).
 *
 * The OS hands an incoming Universal/App Link (`https://musaium.com/<locale>/…`)
 * or custom-scheme deep link (`musaium://…`) to this function before navigation.
 * `event.path` is the FULL URL string on both the cold-start (`initial: true`)
 * and warm paths (verified `node_modules/expo-router/build/{getLinkingConfig,
 * link/linking}.js`); we treat both identically.
 *
 * We delegate the rewrite to the pure {@link mapMagicLinkPath}:
 *  - a recognised magic link → its bare app route with the `?token=` query
 *    preserved byte-for-byte,
 *  - everything else → `event.path` returned UNCHANGED (a pass-through, NOT
 *    `null` — `null` means "stay on the current path", which would break the
 *    existing `musaium://` deep links).
 *
 * Throwing here can crash the app (types.d.ts), so the call is wrapped in
 * try/catch returning the original path on any error. The token is opaque and
 * is never logged (R13).
 */
export function redirectSystemPath(event: { path: string; initial: boolean }): string {
  try {
    return mapMagicLinkPath(event.path);
  } catch {
    return event.path;
  }
}
