import { httpClient } from '@/shared/infrastructure/httpClient';

/**
 * Paywall lead capture payload.
 *
 * `consent: true` is a literal (GDPR Art. 7 — explicit affirmative
 * statement). `website` is the honeypot field (bots auto-fill every input;
 * non-empty value → BE silent-drops).
 *
 * TODO swap to `OpenApiResponseFor<…>` / `OpenApiJsonRequestBodyFor<…>` when
 * the BE OpenAPI spec exposes `/api/leads/paywall-interest` (currently absent
 * from `shared/api/generated/openapi.ts`).
 */
export interface PaywallLeadPayload {
  email: string;
  consent: true;
  website: string;
}

/**
 * Paywall lead capture façade.
 *
 * C1 hexagonal (2026-05-23) — wraps `POST /api/leads/paywall-interest`. The
 * `QuotaUpsellModal` UI component previously imported `httpClient` directly
 * (UI → transport, the worst hexagonal violation).
 *
 * Errors propagate untouched — the modal flips `state='error'` on any
 * rejection (axios envelope or otherwise).
 */
export const leadsApi = {
  /**
   * POSTs the paywall lead payload byte-for-byte (preserves honeypot +
   * explicit `consent: true` literal).
   */
  async submitPaywallInterest(payload: PaywallLeadPayload): Promise<void> {
    await httpClient.post('/api/leads/paywall-interest', payload);
  },
};
