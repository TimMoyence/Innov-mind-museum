import { ExportUserDataUseCase } from '@modules/auth/useCase/exportUserData.useCase';
import type {
  ChatDataExportPort,
  UserChatExportData,
} from '@modules/auth/domain/exportUserData.types';

const makeFakeChatExport = (data: UserChatExportData): ChatDataExportPort => ({
  getAllUserData: async () => data,
});

const baseUser = {
  id: 1,
  email: 'ada@example.com',
  firstname: 'Ada' as string | null,
  lastname: 'Lovelace' as string | null,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-06-01'),
};

describe('ExportUserDataUseCase', () => {
  it('assembles payload with user + chat data', async () => {
    const chatData: UserChatExportData = {
      sessions: [
        {
          id: 'session-1',
          locale: 'fr-FR',
          museumMode: true,
          title: 'Visit to Louvre',
          museumName: 'Louvre',
          createdAt: '2025-03-01T10:00:00.000Z',
          updatedAt: '2025-03-01T11:00:00.000Z',
          messages: [
            {
              id: 'msg-1',
              role: 'user',
              text: 'Tell me about the Mona Lisa',
              createdAt: '2025-03-01T10:01:00.000Z',
            },
            {
              id: 'msg-2',
              role: 'assistant',
              text: 'The Mona Lisa is...',
              createdAt: '2025-03-01T10:01:05.000Z',
            },
          ],
        },
      ],
    };

    const useCase = new ExportUserDataUseCase({
      chatDataExport: makeFakeChatExport(chatData),
    });

    const result = await useCase.execute(baseUser);

    expect(new Date(result.exportedAt).getTime()).not.toBeNaN();
    expect(result.user.id).toBe(1);
    expect(result.user.email).toBe('ada@example.com');
    expect(result.user.firstname).toBe('Ada');
    expect(result.chatData.sessions).toHaveLength(1);
    expect(result.chatData.sessions[0].messages).toHaveLength(2);
  });

  it('handles user with no chat data', async () => {
    const useCase = new ExportUserDataUseCase({
      chatDataExport: makeFakeChatExport({ sessions: [] }),
    });

    const result = await useCase.execute(baseUser);

    expect(result.user.email).toBe('ada@example.com');
    expect(result.chatData.sessions).toHaveLength(0);
  });

  it('includes null for optional user fields', async () => {
    const useCase = new ExportUserDataUseCase({
      chatDataExport: makeFakeChatExport({ sessions: [] }),
    });

    const result = await useCase.execute({
      ...baseUser,
      firstname: null,
      lastname: null,
    });

    expect(result.user.firstname).toBeNull();
    expect(result.user.lastname).toBeNull();
  });
});
