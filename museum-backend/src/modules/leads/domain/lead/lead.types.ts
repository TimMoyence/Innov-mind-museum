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

/** Which public endpoint captured the lead (spec §6). */
export type LeadType = 'b2b' | 'beta' | 'paywall';

/**
 * Delivery lifecycle (spec §6):
 * - `pending`   — persisted, Brevo delivery not yet confirmed.
 * - `delivered` — Brevo delivery succeeded.
 * - `failed`    — last delivery attempt threw; recoverable by the retry job.
 */
export type LeadStatus = 'pending' | 'delivered' | 'failed';

/**
 * The validated charge persisted as jsonb and handed to the notifier.
 *
 * B2B leads carry the full `B2bLeadPayload` (email/name/museum/role/message);
 * beta + paywall carry `BetaSignupPayload` (email + optional `source`
 * discriminator). Both share `email` + `consent` so PII/erasure logic (R20)
 * can read `payload.email` uniformly.
 */
export type LeadPayload = B2bLeadPayload | BetaSignupPayload;

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
