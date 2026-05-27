/**
 * GDPR erasure run — constructors for `DeleteAccountUseCase` /
 * `ExportUserDataUseCase`. These helpers map the local structural wiring shapes
 * onto the real use-case constructors. The `*Like` interfaces are structural
 * projections of the real ports, so we go through a cast (allowed in
 * `tests/helpers/`) to bridge them.
 *
 * Constructor contracts:
 *  - `new DeleteAccountUseCase({ userRepository, imageStorage?,
 *      legacyImageRefLookup?, audioCleanup?, brevoRemoval?,
 *      marketingErasureFallback?, leadErasure? })` — named-options object.
 *      audioCleanup: { deleteUserAudio(userId): Promise<void> }   (AudioCleanupPort)
 *      brevoRemoval: { removeContact(email): Promise<unknown> }
 *  - `new ExportUserDataUseCase(deps)` where `deps` adds
 *      userMemoryExport / auditLogExport / messageFeedbackExport /
 *      messageReportExport / socialAccountExport / apiKeyExport ports (each
 *      `getForUser`/`listForUser`).
 */
import { DeleteAccountUseCase } from '@modules/auth/useCase/account/deleteAccount.useCase';
import { ExportUserDataUseCase } from '@modules/auth/useCase/account/exportUserData.useCase';

import type { IUserRepository } from '@modules/auth/domain/user/user.repository.interface';
import type { User } from '@modules/auth/domain/user/user.entity';

/** AudioCleanupPort shape (shared/ports/audio-cleanup.port.ts, added in green). */
export interface AudioCleanupLike {
  deleteUserAudio(userId: number): Promise<void>;
}

/** Brevo contact-removal shape wired into DeleteAccountUseCase. */
export interface BrevoRemovalLike {
  removeContact(email: string): Promise<unknown>;
}

/** Image-cleanup port shape (matches @shared/ports/image-cleanup.port). */
export interface ImageCleanupLike {
  deleteByPrefix(userId: number | string, legacyFetcher?: unknown): Promise<void>;
}

/**
 * Cycle D (T2.x, R5) — durable Brevo-erasure fallback port. When the inline
 * `removeContact` step fails, the use case enqueues a durable retry intent
 * (a `brevo_erasure` lead) instead of warn-and-dropping. Added by the green
 * phase as a NEW constructor arg on `DeleteAccountUseCase`; absent today.
 */
export interface MarketingErasureFallbackLike {
  enqueueBrevoErasure(email: string): Promise<void>;
}

/**
 * Cycle D (T3.x, R6) — leads erasure port (`ILeadRepository.deleteByEmail`
 * projection). Wired into the deletion flow BEFORE the cascade so the email is
 * still resolvable. Added by the green phase as a NEW constructor arg.
 */
export interface LeadErasureLike {
  deleteByEmail(emailNormalized: string): Promise<number>;
}

/** Legacy image-ref lookup shape. */
export interface LegacyLookupLike {
  findLegacyImageRefsByUserId(userId: number): Promise<string[]>;
}

export interface DeleteAccountWiring {
  userRepository: IUserRepository;
  imageStorage?: ImageCleanupLike;
  legacyImageRefLookup?: LegacyLookupLike;
  audioCleanup?: AudioCleanupLike;
  brevoRemoval?: BrevoRemovalLike;
  /** Cycle D (R5) — durable Brevo-erasure fallback (green-phase ctor arg). */
  marketingErasureFallback?: MarketingErasureFallbackLike;
  /** Cycle D (R6) — leads erasure port (green-phase ctor arg). */
  leadErasure?: LeadErasureLike;
}

/**
 * Constructs `DeleteAccountUseCase` from the local structural wiring shapes.
 * The ctor takes a named-options object; the local `*Like` interfaces are
 * structural projections of the real ports, so we go through a cast (allowed in
 * `tests/helpers/`) to map the wiring onto the options object.
 * @param w - wiring with the user repo + optional cleanup/fallback ports.
 */
export function makeDeleteAccountUseCase(w: DeleteAccountWiring): DeleteAccountUseCase {
  const Ctor = DeleteAccountUseCase as unknown as new (options: {
    userRepository: IUserRepository;
    imageStorage?: ImageCleanupLike;
    legacyImageRefLookup?: LegacyLookupLike;
    audioCleanup?: AudioCleanupLike;
    brevoRemoval?: BrevoRemovalLike;
    marketingErasureFallback?: MarketingErasureFallbackLike;
    leadErasure?: LeadErasureLike;
  }) => DeleteAccountUseCase;
  return new Ctor({
    userRepository: w.userRepository,
    imageStorage: w.imageStorage,
    legacyImageRefLookup: w.legacyImageRefLookup,
    audioCleanup: w.audioCleanup,
    brevoRemoval: w.brevoRemoval,
    marketingErasureFallback: w.marketingErasureFallback,
    leadErasure: w.leadErasure,
  });
}

// ─── Export use-case (T3.1) ─────────────────────────────────────────────────

/** A port exposing a single `listForUser(userId) => Promise<T[]>`. */
export interface ListForUserPort<T> {
  listForUser(userId: number): Promise<T[]>;
}

/** A port exposing a single `getForUser(userId) => Promise<T | null>`. */
export interface GetForUserPort<T> {
  getForUser(userId: number): Promise<T | null>;
}

/**
 * Full export-deps wiring for the DSAR completeness test. Keys match the green
 * contract (T3.3). The existing keys (`chatDataExport`, `reviewDataExport`,
 * `supportDataExport`, `userConsentRepository`) are required by the current
 * ctor; the new keys are read by the green-phase `execute`.
 */
export interface ExportWiring {
  chatDataExport: { getAllUserData(userId: number): Promise<{ sessions: unknown[] }> };
  reviewDataExport: ListForUserPort<unknown>;
  supportDataExport: ListForUserPort<unknown>;
  userConsentRepository: { listForUser(userId: number): Promise<unknown[]> };
  userMemoryExport: GetForUserPort<unknown>;
  auditLogExport: ListForUserPort<unknown>;
  messageFeedbackExport: ListForUserPort<unknown>;
  messageReportExport: ListForUserPort<unknown>;
  socialAccountExport: ListForUserPort<unknown>;
  apiKeyExport: ListForUserPort<unknown>;
}

/**
 * Constructs `ExportUserDataUseCase` with the (future) export ports.
 * @param deps - export wiring (existing + new ports).
 */
export function makeExportUserDataUseCase(deps: ExportWiring): ExportUserDataUseCase {
  const Ctor = ExportUserDataUseCase as unknown as new (
    deps: ExportWiring,
  ) => ExportUserDataUseCase;
  return new Ctor(deps);
}

/** Runs the export use case's `execute(user)` and returns the payload as a record. */
export async function runExport(
  useCase: ExportUserDataUseCase,
  user: User,
): Promise<Record<string, unknown>> {
  const exec = (useCase as unknown as { execute(u: User): Promise<unknown> }).execute.bind(useCase);
  return (await exec(user)) as Record<string, unknown>;
}
