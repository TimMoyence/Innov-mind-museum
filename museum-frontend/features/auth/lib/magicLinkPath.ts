/**
 * Pure URL-rewrite for incoming `musaium.com` magic-link Universal/App Links.
 *
 * Consumed by `app/+native-intent.tsx` (`redirectSystemPath`). Kept as a plain,
 * React-free, expo-free module so it is unit-testable in isolation
 * (design D2). The framework hook is a thin try/catch wrapper around this fn.
 *
 * Contract (spec R2/R3, design §6.1 + D3):
 *  - strip an optional `/fr` | `/en` locale prefix,
 *  - map `verify-email | reset-password | confirm-email-change` to the bare
 *    app route `/<route>`,
 *  - PRESERVE the original query string byte-for-byte by slicing from the first
 *    `?` of the *original* input — NEVER round-trip through `URLSearchParams`
 *    (that would re-encode `%20`↔`+` and reorder params; the #1 risk, D3),
 *  - return EVERY other path UNCHANGED (pass-through, NOT `null`) so unrelated
 *    `musaium://` deep links (museums-picker) are not regressed.
 *
 * The token is opaque here: it travels inside the preserved query slice and is
 * never parsed, logged, or otherwise inspected (R13).
 */

/** App routes a magic link may target (the only recognised first segments). */
const MAGIC_LINK_ROUTES = new Set(['verify-email', 'reset-password', 'confirm-email-change']);

/** Optional locale prefixes carried by web magic-link URLs (cycle-1 AASA scope). */
const LOCALE_PREFIXES = new Set(['fr', 'en']);

/**
 * Maps an incoming system URL/path to an Expo Router route, or returns it
 * unchanged when it is not a recognised magic-link path.
 *
 * @param input - The full incoming URL string (scheme+host+path+query) OR a
 *   bare path, exactly as handed over by `redirectSystemPath({ path })`.
 * @returns The rewritten app route (with the original query verbatim) for a
 *   recognised magic link, otherwise the `input` string unchanged.
 */
export const mapMagicLinkPath = (input: string): string => {
  // Split the path portion from the query, preserving the query byte-for-byte.
  const queryIndex = input.indexOf('?');
  const beforeQuery = queryIndex === -1 ? input : input.slice(0, queryIndex);
  const query = queryIndex === -1 ? '' : input.slice(queryIndex); // includes the leading '?'

  // Strip an optional scheme + authority (`https://host`, `musaium://host`)
  // without round-tripping through URL (keeps this fn dependency-free + total).
  const schemeMatch = /^[a-z][a-z0-9+.-]*:\/\//i.exec(beforeQuery);
  let pathOnly = beforeQuery;
  if (schemeMatch) {
    const afterScheme = beforeQuery.slice(schemeMatch[0].length);
    const firstSlash = afterScheme.indexOf('/');
    // No path after the authority (e.g. `https://musaium.com`) → pass through.
    if (firstSlash === -1) return input;
    pathOnly = afterScheme.slice(firstSlash);
  }

  // Tokenise the path into non-empty segments.
  const segments = pathOnly.split('/').filter((segment) => segment.length > 0);
  if (segments.length === 0) return input;

  // Drop a leading locale prefix if present.
  const firstSegment = segments[0];
  const routeSegments =
    firstSegment !== undefined && LOCALE_PREFIXES.has(firstSegment) ? segments.slice(1) : segments;

  // A magic link maps iff its (post-locale) FIRST segment is a recognised route
  // and there is no deeper sub-path (the three routes are leaf screens).
  const route = routeSegments[0];
  if (routeSegments.length !== 1 || route === undefined || !MAGIC_LINK_ROUTES.has(route)) {
    return input;
  }

  return `/${route}${query}`;
};
