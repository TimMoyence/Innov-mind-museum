/**
 * Cycle B (« Aucun lead perdu ») domain types for the persisted `Lead` entity.
 *
 * The 3 leads use-cases (b2b / beta / paywall) were 100 % stateless; cycle B
 * introduces a persisted `Lead` so a Brevo runtime failure no longer loses the
 * lead. These types are the domain contract shared by the entity, the
 * `ILeadRepository` port and the use-cases (spec §3, design §3/§4).
 *
 * `LeadPayload` is the discriminated union of the two notifier payloads already
 * defined in the ports (`B2bLeadPayload` / `BetaSignupPayload`) — the exact
 * validated charge handed to the notifier, persisted verbatim as jsonb (R4).
 */
import type { B2bLeadPayload } from '@modules/leads/domain/ports/b2b-lead-notifier.port';
import type { BetaSignupPayload } from '@modules/leads/domain/ports/beta-signup-notifier.port';

/**
 * Which public endpoint captured the lead (spec §6).
 *
 * Cycle D (R5) — `'brevo_erasure'` is NOT a captured lead but a durable GDPR
 * Art.17 erasure intent: when account deletion's inline Brevo `removeContact`
 * fails, the use case persists a `brevo_erasure` lead so the WS-B redelivery
 * cron retries the contact REMOVAL (not a subscribe) until it succeeds/404s.
 * Reuses the `leads` table verbatim (payload = `{ email }`) — no new store.
 */
export type LeadType = 'b2b' | 'beta' | 'paywall' | 'brevo_erasure';

/**
 * Delivery lifecycle (spec §6):
 * - `pending`   — persisted, Brevo delivery not yet confirmed.
 * - `delivered` — Brevo delivery succeeded.
 * - `failed`    — last delivery attempt threw; recoverable by the retry job.
 */
export type LeadStatus = 'pending' | 'delivered' | 'failed';

/**
 * Cycle D (R5) — payload of a `brevo_erasure` lead: a GDPR Art.17 erasure
 * intent. Carries ONLY the email to remove from Brevo (no consent — erasure is
 * not a subscription). Persisted verbatim as jsonb; `payload.email` is read
 * uniformly by `deleteByEmail` (R6) and the erasure notifier (`removeContact`).
 */
export interface BrevoErasurePayload {
  email: string;
}

/**
 * The validated charge persisted as jsonb and handed to the notifier.
 *
 * B2B leads carry the full `B2bLeadPayload` (email/name/museum/role/message);
 * beta + paywall carry `BetaSignupPayload` (email + optional `source`
 * discriminator); `brevo_erasure` carries `BrevoErasurePayload` (email only).
 * All share `email` so PII/erasure logic (R20) can read `payload.email`
 * uniformly.
 */
export type LeadPayload = B2bLeadPayload | BetaSignupPayload | BrevoErasurePayload;

/**
 * Input to `ILeadRepository.insertPending` (R1). `dedupKey` is only set for B2B
 * (sha256(type|email|museum)); `null`/omitted for beta/paywall (dedup delegated
 * to Brevo, spec R15).
 */
export interface InsertLeadInput {
  type: LeadType;
  payload: LeadPayload;
  dedupKey?: string | null;
}

/**
 * Repository projection of a persisted `Lead` (timestamps as ISO strings on the
 * wire — mirror `TicketDTO` convention, support.types.ts).
 */
export interface LeadDTO {
  id: string;
  type: LeadType;
  status: LeadStatus;
  payload: LeadPayload;
  dedupKey: string | null;
  attempts: number;
  lastError: string | null;
  nextEligibleAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
  updatedAt: string;
}
