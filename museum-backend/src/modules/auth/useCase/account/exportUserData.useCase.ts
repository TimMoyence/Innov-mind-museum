import type { IUserConsentRepository } from '../../domain/consent/userConsent.repository.interface';
import type {
  ChatDataExportPort,
  ReviewDataExportPort,
  SupportDataExportPort,
  UserConsentExportEntry,
  UserExportPayload,
} from '../../domain/export/exportUserData.types';
import type { User } from '../../domain/user/user.entity';

interface ExportUserDataDeps {
  chatDataExport: ChatDataExportPort;
  reviewDataExport: ReviewDataExportPort;
  supportDataExport: SupportDataExportPort;
  userConsentRepository: IUserConsentRepository;
}

/**
 * Assembles the GDPR Article 15 (access) + Article 20 (portability) export
 * payload for the requesting user.
 *
 * Pulls from each module via its registered port — never queries DB directly,
 * so this stays inside the hexagonal contract for the auth module.
 *
 * Saved artworks (mobile local storage) are intentionally absent: they are
 * never persisted server-side, so they cannot leak through this endpoint.
 */
export class ExportUserDataUseCase {
  constructor(private readonly deps: ExportUserDataDeps) {}

  /** Builds the full export payload for the given persisted user record. */
  async execute(user: User): Promise<UserExportPayload> {
    const [chatData, reviews, supportTickets, consentRows] = await Promise.all([
      this.deps.chatDataExport.getAllUserData(user.id),
      this.deps.reviewDataExport.listForUser(user.id),
      this.deps.supportDataExport.listForUser(user.id),
      this.deps.userConsentRepository.listForUser(user.id),
    ]);

    const consent: UserConsentExportEntry[] = consentRows.map((row) => ({
      scope: row.scope,
      version: row.version,
      source: row.source,
      grantedAt: row.grantedAt.toISOString(),
      revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
    }));

    return {
      exportedAt: new Date().toISOString(),
      schemaVersion: '1',
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        firstname: user.firstname ?? null,
        lastname: user.lastname ?? null,
        // Per-user locale isn't a profile column today; the field is reserved in
        // the schema for forward compat (matches mobile preference). Stays null
        // until persisted.
        locale: null,
        emailVerified: user.email_verified,
        onboardingCompleted: user.onboarding_completed,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
      },
      consent,
      chatSessions: chatData.sessions,
      savedArtworks: [],
      reviews,
      supportTickets,
    };
  }
}
