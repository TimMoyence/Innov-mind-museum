import { readEnvString } from '@/shared/lib/env';
import { hasAnalyticsConsent } from '@/shared/analytics/useAnalyticsConsent';

/**
 * Wave C5 / T-C54 — Mobile Plausible funnel emitter.
 *
 * Lib-docs reference : `lib-docs/plausible/PATTERNS.md` §3.3 (RN emits via BE
 * proxy `POST /api/telemetry/funnel`, NEVER `plausible.io` direct — keeps the
 * Plausible domain out of cert-pinning + centralises consent gate BE-side) +
 * §3.4 (consent gate fail-closed BEFORE the fetch) + §5 anti-pattern #1 (NO
 * PII in props) + §2 (`name`/`url`/`domain` required body params).
 *
 * Contract surface (frozen RED test `plausible-consent.test.ts` pins this) :
 *  - `trackFunnelEvent(name, props?)` — Promise<void>, never throws.
 *  - `__setHasAnalyticsConsentForTest(fn|null)` — test seam, swaps the
 *    consent predicate. `null` restores the production predicate
 *    (`hasAnalyticsConsent()` from the hook module).
 *
 * Anti-patterns enforced :
 *  - Consent absent → 0 fetch call (R-C5b GDPR Art. 7).
 *  - PII keys stripped before forwarding (defense-in-depth ; BE adapter also
 *    strips, but the FE strip prevents a buggy caller leaking through axios
 *    request interceptors / Sentry breadcrumbs).
 */

const PII_CANARY_KEYS = new Set([
  'email',
  'userEmail',
  'phone',
  'phoneNumber',
  'fullName',
  'firstName',
  'lastName',
  'address',
  'birthdate',
  'dateOfBirth',
  'userId',
]);

const stripPii = (
  props: Record<string, string | number | boolean> | undefined,
): Record<string, string | number | boolean> | undefined => {
  if (!props) return undefined;
  const cleaned: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(props)) {
    if (PII_CANARY_KEYS.has(key)) continue;
    cleaned[key] = value;
  }
  return cleaned;
};

// Production consent predicate — reads the in-memory cell populated by
// `useAnalyticsConsent()` hydration. Test seam below swaps this for a fake.
const defaultConsentPredicate: () => boolean = () => hasAnalyticsConsent();
let consentPredicate: () => boolean = defaultConsentPredicate;

/**
 * Test-only seam. Passing `null` restores the production predicate.
 * Frozen RED test `plausible-consent.test.ts` calls this in each `it` and
 * resets in `afterEach` (`__setHasAnalyticsConsentForTest(null)`).
 *
 * @internal
 */
export function __setHasAnalyticsConsentForTest(fn: (() => boolean) | null): void {
  consentPredicate = fn ?? defaultConsentPredicate;
}

/**
 * Resolve the BE proxy endpoint at call time (not module load) so tests can
 * mutate `process.env.EXPO_PUBLIC_PLAUSIBLE_ENDPOINT_URL` between cases.
 *
 * Reads via {@link readEnvString} to survive the CLAUDE.md gotcha
 * "`process.env.X` typed local vs CI diff" — predicate-narrowing yields
 * `string | undefined` on both sides.
 */
const resolveEndpoint = (): string | undefined => {
  const explicit = readEnvString(process.env.EXPO_PUBLIC_PLAUSIBLE_ENDPOINT_URL);
  if (explicit) return explicit;
  // Fallback : compose from API base URL so a single env var is sufficient
  // in most deployments.
  const apiBase = readEnvString(process.env.EXPO_PUBLIC_API_BASE_URL);
  return apiBase ? `${apiBase.replace(/\/$/, '')}/api/telemetry/funnel` : undefined;
};

const resolveDomain = (): string | undefined =>
  readEnvString(process.env.EXPO_PUBLIC_PLAUSIBLE_DOMAIN);

/**
 * Synthetic URL field — Plausible requires a `url` body param even for
 * server-emitted events. RN apps have no `window.location`, so we use an
 * `app://` scheme so the dashboard can segment mobile vs web traffic.
 */
const resolveUrl = (): string => 'app://musaium/mobile';

/**
 * Fire-and-forget funnel event emitter. Never throws — analytics MUST NOT
 * disrupt the user flow (PATTERNS.md §5 anti-pattern #10).
 *
 * @param name   Funnel event name (e.g. `paywall_modal_shown`).
 * @param props  Optional scalar properties (no PII — see {@link PII_CANARY_KEYS}).
 */
export async function trackFunnelEvent(
  name: string,
  props?: Record<string, string | number | boolean>,
): Promise<void> {
  // R-C5b GDPR — short-circuit BEFORE the fetch. ZERO network call.
  if (!consentPredicate()) return;

  const endpoint = resolveEndpoint();
  if (!endpoint) return; // No-op fallback (dev without env vars).

  const domain = resolveDomain();
  if (!domain) return;

  const safeProps = stripPii(props);

  try {
    await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // TD-C5-CONSENT-HEADER-01 — defense-in-depth GDPR Art. 7 gate. The
        // BE proxy rejects requests without this header (403 consent_required),
        // even though we've already short-circuited above on `consentPredicate`.
        // The literal `'granted'` is safe to hard-code here because this code
        // path is only reached when consent IS granted. Mirrors the BE strict
        // string-equality check in `funnel.route.ts`.
        'X-Musaium-Analytics-Consent': 'granted',
      },
      body: JSON.stringify({
        name,
        url: resolveUrl(),
        domain,
        props: safeProps,
      }),
    });
  } catch {
    // Analytics MUST never block UX — swallow.
  }
}
