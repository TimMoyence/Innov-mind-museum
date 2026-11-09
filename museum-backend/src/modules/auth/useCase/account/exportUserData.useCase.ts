import type { IUserConsentRepository } from '@modules/auth/domain/consent/userConsent.repository.interface';
import type {
  AuditLogExportPort,
  AuditLogSource,
  ChatDataExportPort,
  MessageFeedbackExportPort,
  MessageFeedbackSource,
  MessageReportExportPort,
  MessageReportSource,
  ReviewDataExportPort,
  SocialAccountExportPort,
  SocialAccountSource,
  SupportDataExportPort,
  UserAuditLogExportEntry,
  UserConsentExportEntry,
  UserExportPayload,
  UserMemoryExportEntry,
  UserMemoryExportPort,
  UserMemorySource,
  UserMessageFeedbackExportEntry,
  UserMessageReportExportEntry,
  UserSocialAccountExportEntry,
} from '@modules/auth/domain/exportUserData.types';
import type { User } from '@modules/auth/domain/user/user.entity';

interface ExportUserDataDeps {
  chatDataExport: ChatDataExportPort;
  reviewDataExport: ReviewDataExportPort;
  supportDataExport: SupportDataExportPort;
  userConsentRepository: IUserConsentRepository;
  userMemoryExport: UserMemoryExportPort;
  auditLogExport: AuditLogExportPort;
  messageFeedbackExport: MessageFeedbackExportPort;
  messageReportExport: MessageReportExportPort;
  socialAccountExport: SocialAccountExportPort;
}

function toIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toIsoDate(value: Date | string | null | undefined): string | null {
  const iso = toIso(value);
  return iso ? iso.slice(0, 10) : null;
}

export class ExportUserDataUseCase {
  constructor(private readonly deps: ExportUserDataDeps) {}

  async execute(user: User): Promise<UserExportPayload> {
    const [
      chatData,
      reviews,
      supportTickets,
      consentRows,
      userMemory,
      auditLogs,
      messageFeedback,
      messageReports,
      socialAccounts,
    ] = await Promise.all([
      this.deps.chatDataExport.getAllUserData(user.id),
      this.deps.reviewDataExport.listForUser(user.id),
      this.deps.supportDataExport.listForUser(user.id),
      this.deps.userConsentRepository.listForUser(user.id),
      this.deps.userMemoryExport.getForUser(user.id),
      this.deps.auditLogExport.listForUser(user.id),
      this.deps.messageFeedbackExport.listForUser(user.id),
      this.deps.messageReportExport.listForUser(user.id),
      this.deps.socialAccountExport.listForUser(user.id),
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
      schemaVersion: '3',
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        firstname: user.firstname ?? null,
        lastname: user.lastname ?? null,
        tier: user.tier,
        dateOfBirth: toIsoDate(user.dateOfBirth),
        contentPreferences: [...user.contentPreferences],
        ttsVoice: user.ttsVoice ?? null,
        notifyOnReviewModeration: user.notifyOnReviewModeration,
        defaultMuseumMode: user.defaultMuseumMode,
        guideLevel: user.guideLevel,
        dataMode: user.dataMode,
        audioDescriptionMode: user.audioDescriptionMode,
        suspended: user.suspended,
        museumId: user.museumId ?? null,
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
      userMemory: mapUserMemory(userMemory),
      auditLogs: auditLogs.map(mapAuditLog),
      messageFeedback: messageFeedback.map(mapMessageFeedback),
      messageReports: messageReports.map(mapMessageReport),
      socialAccounts: socialAccounts.map(mapSocialAccount),
    };
  }
}

function mapUserMemory(source: UserMemorySource | null): UserMemoryExportEntry | null {
  if (!source) return null;
  return {
    preferredExpertise: source.preferredExpertise ?? null,
    favoritePeriods: source.favoritePeriods ?? [],
    favoriteArtists: source.favoriteArtists ?? [],
    museumsVisited: source.museumsVisited ?? [],
    totalArtworksDiscussed: source.totalArtworksDiscussed ?? 0,
    notableArtworks: source.notableArtworks ?? [],
    interests: source.interests ?? [],
    summary: source.summary ?? null,
    disabledByUser: source.disabledByUser ?? false,
    sessionCount: source.sessionCount ?? 0,
    languagePreference: source.languagePreference ?? null,
    createdAt: toIso(source.createdAt),
    updatedAt: toIso(source.updatedAt),
  };
}

function mapAuditLog(source: AuditLogSource): UserAuditLogExportEntry {
  return {
    action: source.action,
    actorType: source.actorType,
    targetType: source.targetType,
    targetId: source.targetId,
    metadata: source.metadata,
    ip: source.ip,
    requestId: source.requestId,
    createdAt: toIso(source.createdAt) ?? new Date(0).toISOString(),
  };
}

function mapMessageFeedback(source: MessageFeedbackSource): UserMessageFeedbackExportEntry {
  return {
    messageId: source.messageId,
    value: source.value,
    createdAt: toIso(source.createdAt) ?? new Date(0).toISOString(),
  };
}

function mapMessageReport(source: MessageReportSource): UserMessageReportExportEntry {
  return {
    messageId: source.messageId,
    reason: source.reason,
    comment: source.comment ?? null,
    status: source.status,
    createdAt: toIso(source.createdAt) ?? new Date(0).toISOString(),
  };
}

function mapSocialAccount(source: SocialAccountSource): UserSocialAccountExportEntry {
  return {
    provider: source.provider,
    providerUserId: source.providerUserId,
    email: source.email ?? null,
    createdAt: toIso(source.createdAt) ?? new Date(0).toISOString(),
  };
}
