import { ExportUserDataUseCase } from '@modules/auth/useCase/exportUserData.useCase';

import { makeUser } from 'tests/helpers/auth/user.fixtures';

import type {
  ChatDataExportPort,
  ReviewDataExportPort,
  SupportDataExportPort,
  UserChatExportData,
  UserReviewExportEntry,
  UserSupportTicketExportEntry,
} from '@modules/auth/domain/exportUserData.types';
import type { IUserConsentRepository } from '@modules/auth/domain/userConsent.repository.interface';
import type { UserConsent } from '@modules/auth/domain/userConsent.entity';

const makeChatPort = (data: UserChatExportData): ChatDataExportPort => ({
  getAllUserData: async () => data,
});

const makeReviewPort = (rows: UserReviewExportEntry[]): ReviewDataExportPort => ({
  listForUser: async () => rows,
});

const makeSupportPort = (rows: UserSupportTicketExportEntry[]): SupportDataExportPort => ({
  listForUser: async () => rows,
});

const makeConsentRepo = (rows: UserConsent[]): IUserConsentRepository => ({
  grant: jest.fn(),
  revoke: jest.fn(),
  isGranted: jest.fn().mockResolvedValue(false),
  listForUser: jest.fn().mockResolvedValue(rows),
});

describe('ExportUserDataUseCase', () => {
  it('assembles full payload with consent + chat + reviews + tickets', async () => {
    const chatData: UserChatExportData = {
      sessions: [
        {
          id: 'session-1',
          locale: 'fr-FR',
          museumMode: true,
          title: 'Visit to Louvre',
          museumName: 'Louvre',
          createdAt: '2026-03-01T10:00:00.000Z',
          updatedAt: '2026-03-01T11:00:00.000Z',
          messages: [
            {
              id: 'msg-1',
              role: 'user',
              text: 'Tell me about the Mona Lisa',
              createdAt: '2026-03-01T10:01:00.000Z',
            },
            {
              id: 'msg-2',
              role: 'assistant',
              text: 'The Mona Lisa is...',
              audioUrl: 's3://audio/msg-2.mp3',
              createdAt: '2026-03-01T10:01:05.000Z',
            },
          ],
        },
      ],
    };

    const reviews: UserReviewExportEntry[] = [
      {
        id: 'rev-1',
        rating: 5,
        comment: 'Excellent app',
        status: 'approved',
        userName: 'Ada',
        createdAt: '2026-03-15T08:00:00.000Z',
      },
    ];

    const tickets: UserSupportTicketExportEntry[] = [
      {
        id: 'tkt-1',
        subject: 'Problem with audio',
        description: 'Audio playback fails',
        status: 'open',
        priority: 'medium',
        category: null,
        createdAt: '2026-03-20T09:00:00.000Z',
        updatedAt: '2026-03-20T09:30:00.000Z',
        messages: [
          {
            id: 'tmsg-1',
            senderRole: 'user',
            text: 'Help please',
            createdAt: '2026-03-20T09:05:00.000Z',
          },
        ],
      },
    ];

    const consentRows = [
      {
        id: 1,
        userId: 1,
        scope: 'location_to_llm',
        version: '2026-04-24',
        source: 'ui',
        grantedAt: new Date('2026-04-24T12:00:00.000Z'),
        revokedAt: null,
        createdAt: new Date('2026-04-24T12:00:00.000Z'),
      } as unknown as UserConsent,
    ];

    const useCase = new ExportUserDataUseCase({
      chatDataExport: makeChatPort(chatData),
      reviewDataExport: makeReviewPort(reviews),
      supportDataExport: makeSupportPort(tickets),
      userConsentRepository: makeConsentRepo(consentRows),
    });

    const user = makeUser({
      id: 1,
      email: 'ada@example.com',
      firstname: 'Ada',
      lastname: 'Lovelace',
      role: 'visitor',
      email_verified: true,
      onboarding_completed: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-06-01T00:00:00.000Z'),
    });

    const result = await useCase.execute(user);

    expect(result.schemaVersion).toBe('1');
    expect(new Date(result.exportedAt).getTime()).not.toBeNaN();
    expect(result.user.id).toBe(1);
    expect(result.user.email).toBe('ada@example.com');
    expect(result.user.role).toBe('visitor');
    expect(result.user.emailVerified).toBe(true);
    expect(result.user.onboardingCompleted).toBe(true);
    expect(result.consent).toHaveLength(1);
    expect(result.consent[0].scope).toBe('location_to_llm');
    expect(result.consent[0].revokedAt).toBeNull();
    expect(result.chatSessions).toHaveLength(1);
    expect(result.chatSessions[0].messages).toHaveLength(2);
    expect(result.savedArtworks).toEqual([]);
    expect(result.reviews).toHaveLength(1);
    expect(result.supportTickets).toHaveLength(1);
    expect(result.supportTickets[0].messages).toHaveLength(1);
  });

  it('returns empty arrays when the user has no data', async () => {
    const useCase = new ExportUserDataUseCase({
      chatDataExport: makeChatPort({ sessions: [] }),
      reviewDataExport: makeReviewPort([]),
      supportDataExport: makeSupportPort([]),
      userConsentRepository: makeConsentRepo([]),
    });

    const user = makeUser({ id: 7, email: 'empty@example.com' });

    const result = await useCase.execute(user);

    expect(result.user.email).toBe('empty@example.com');
    expect(result.consent).toEqual([]);
    expect(result.chatSessions).toEqual([]);
    expect(result.reviews).toEqual([]);
    expect(result.supportTickets).toEqual([]);
    expect(result.savedArtworks).toEqual([]);
  });

  it('serialises null for optional user fields', async () => {
    const useCase = new ExportUserDataUseCase({
      chatDataExport: makeChatPort({ sessions: [] }),
      reviewDataExport: makeReviewPort([]),
      supportDataExport: makeSupportPort([]),
      userConsentRepository: makeConsentRepo([]),
    });

    const user = makeUser({ firstname: undefined, lastname: undefined });

    const result = await useCase.execute(user);

    expect(result.user.firstname).toBeNull();
    expect(result.user.lastname).toBeNull();
    expect(result.user.locale).toBeNull();
  });

  it('preserves revokedAt timestamp for revoked consents', async () => {
    const revokedAt = new Date('2026-04-25T12:00:00.000Z');
    const consentRows = [
      {
        id: 2,
        userId: 1,
        scope: 'analytics',
        version: '2026-04-01',
        source: 'ui',
        grantedAt: new Date('2026-04-01T00:00:00.000Z'),
        revokedAt,
        createdAt: new Date('2026-04-01T00:00:00.000Z'),
      } as unknown as UserConsent,
    ];

    const useCase = new ExportUserDataUseCase({
      chatDataExport: makeChatPort({ sessions: [] }),
      reviewDataExport: makeReviewPort([]),
      supportDataExport: makeSupportPort([]),
      userConsentRepository: makeConsentRepo(consentRows),
    });

    const result = await useCase.execute(makeUser());

    expect(result.consent[0].revokedAt).toBe(revokedAt.toISOString());
  });
});
