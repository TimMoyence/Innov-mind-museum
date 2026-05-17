import type { IUserConsentRepository } from '@modules/auth/domain/consent/userConsent.repository.interface';
import type {
  ChatDataExportPort,
  ReviewDataExportPort,
  SupportDataExportPort,
  UserConsentExportEntry,
  UserExportPayload,
} from '@modules/auth/domain/exportUserData.types';
import type { User } from '@modules/auth/domain/user/user.entity';

interface ExportUserDataDeps {
  chatDataExport: ChatDataExportPort;
  reviewDataExport: ReviewDataExportPort;
  supportDataExport: SupportDataExportPort;
  userConsentRepository: IUserConsentRepository;
}

/**
 * GDPR Art. 15 (access) + Art. 20 (portability) payload assembler.
 * Pulls from each module via its registered port — never queries DB directly,
 * stays inside the hexagonal contract. Saved artworks (mobile-local) absent
 * by design: never persisted server-side.
 */
export class ExportUserDataUseCase {
  constructor(private readonly deps: ExportUserDataDeps) {}

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
        // Reserved for forward compat (matches mobile preference). Stays null until persisted.
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
