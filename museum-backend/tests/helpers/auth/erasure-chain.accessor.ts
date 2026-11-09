import { DeleteAccountUseCase } from '@modules/auth/useCase/account/deleteAccount.useCase';
import { ExportUserDataUseCase } from '@modules/auth/useCase/account/exportUserData.useCase';

import type { IUserRepository } from '@modules/auth/domain/user/user.repository.interface';
import type { User } from '@modules/auth/domain/user/user.entity';

export interface AudioCleanupLike {
  deleteUserAudio(userId: number): Promise<void>;
}

export interface BrevoRemovalLike {
  removeContact(email: string): Promise<unknown>;
}

export interface ImageCleanupLike {
  deleteByPrefix(userId: number | string, legacyFetcher?: unknown): Promise<void>;
}

export interface MarketingErasureFallbackLike {
  enqueueBrevoErasure(email: string): Promise<void>;
}

export interface LeadErasureLike {
  deleteByEmail(emailNormalized: string): Promise<number>;
}

export interface LegacyLookupLike {
  findLegacyImageRefsByUserId(userId: number): Promise<string[]>;
}

export interface DeleteAccountWiring {
  userRepository: IUserRepository;
  imageStorage?: ImageCleanupLike;
  legacyImageRefLookup?: LegacyLookupLike;
  audioCleanup?: AudioCleanupLike;
  brevoRemoval?: BrevoRemovalLike;
  marketingErasureFallback?: MarketingErasureFallbackLike;
  leadErasure?: LeadErasureLike;
}

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

export interface ListForUserPort<T> {
  listForUser(userId: number): Promise<T[]>;
}

export interface GetForUserPort<T> {
  getForUser(userId: number): Promise<T | null>;
}

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
}

export function makeExportUserDataUseCase(deps: ExportWiring): ExportUserDataUseCase {
  const Ctor = ExportUserDataUseCase as unknown as new (
    deps: ExportWiring,
  ) => ExportUserDataUseCase;
  return new Ctor(deps);
}

export async function runExport(
  useCase: ExportUserDataUseCase,
  user: User,
): Promise<Record<string, unknown>> {
  const exec = (useCase as unknown as { execute(u: User): Promise<unknown> }).execute.bind(useCase);
  return (await exec(user)) as Record<string, unknown>;
}
