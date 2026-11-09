import { readEnvString } from '@/shared/lib/env';
import { hasAnalyticsConsent } from '@/shared/analytics/useAnalyticsConsent';

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

const defaultConsentPredicate: () => boolean = () => hasAnalyticsConsent();
let consentPredicate: () => boolean = defaultConsentPredicate;

export function __setHasAnalyticsConsentForTest(fn: (() => boolean) | null): void {
  consentPredicate = fn ?? defaultConsentPredicate;
}

const resolveEndpoint = (): string | undefined => {
  const explicit = readEnvString(process.env.EXPO_PUBLIC_PLAUSIBLE_ENDPOINT_URL);
  if (explicit) return explicit;
  const apiBase = readEnvString(process.env.EXPO_PUBLIC_API_BASE_URL);
  return apiBase ? `${apiBase.replace(/\/$/, '')}/api/telemetry/funnel` : undefined;
};

const resolveDomain = (): string | undefined =>
  readEnvString(process.env.EXPO_PUBLIC_PLAUSIBLE_DOMAIN);

const resolveUrl = (): string => 'app://musaium/mobile';

export async function trackFunnelEvent(
  name: string,
  props?: Record<string, string | number | boolean>,
): Promise<void> {
  if (!consentPredicate()) return;

  const endpoint = resolveEndpoint();
  if (!endpoint) return;

  const domain = resolveDomain();
  if (!domain) return;

  const safeProps = stripPii(props);

  try {
    await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Musaium-Analytics-Consent': 'granted',
      },
      body: JSON.stringify({
        name,
        url: resolveUrl(),
        domain,
        props: safeProps,
      }),
    });
  } catch {}
}
