import { getFindAudioRefsByUserId } from 'tests/helpers/chat/gdpr-export-reads.accessor';

import type { ChatMessage } from '@modules/chat/domain/message/chatMessage.entity';
import type { Repository } from 'typeorm';

interface RawAudioRow {
  audioUrl: string | null;
}

const buildMessageRepoMock = (rows: RawAudioRow[]) => {
  const getRawMany = jest.fn().mockResolvedValue(rows);
  const andWhere = jest.fn().mockReturnThis();
  const where = jest.fn().mockReturnThis();
  const innerJoin = jest.fn().mockReturnThis();
  const select = jest.fn().mockReturnThis();
  const qb = { select, innerJoin, where, andWhere, getRawMany };
  const createQueryBuilder = jest.fn().mockReturnValue(qb);
  const repo = { createQueryBuilder } as unknown as Repository<ChatMessage>;
  return { repo, mocks: { createQueryBuilder, getRawMany, andWhere, where, innerJoin, select } };
};

describe('findAudioRefsByUserId (B1 / R1 / R2)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('is exported by the chat-repository-audio module (RED: not yet implemented)', () => {
    expect(getFindAudioRefsByUserId()).toBeInstanceOf(Function);
  });

  it('returns the deduped, non-null audioUrl set for the user', async () => {
    const findAudioRefs = getFindAudioRefsByUserId();
    expect(findAudioRefs).toBeInstanceOf(Function);

    const { repo, mocks } = buildMessageRepoMock([
      { audioUrl: 's3://chat-audios/2026/05/a.mp3' },
      { audioUrl: 's3://chat-audios/2026/05/a.mp3' },
      { audioUrl: 's3://chat-audios/2026/05/b.mp3' },
      { audioUrl: null },
    ]);

    const refs = await findAudioRefs!(repo, 42);

    expect([...refs].sort()).toEqual([
      's3://chat-audios/2026/05/a.mp3',
      's3://chat-audios/2026/05/b.mp3',
    ]);
    expect(mocks.where).toHaveBeenCalledWith('session.userId = :userId', { userId: 42 });
    expect(mocks.andWhere).toHaveBeenCalledWith('message.audioUrl IS NOT NULL');
    expect(mocks.innerJoin).toHaveBeenCalledWith('message.session', 'session');
  });

  it('returns an empty array when the user has no audio messages', async () => {
    const findAudioRefs = getFindAudioRefsByUserId();
    expect(findAudioRefs).toBeInstanceOf(Function);

    const { repo } = buildMessageRepoMock([]);
    const refs = await findAudioRefs!(repo, 7);
    expect(refs).toEqual([]);
  });
});
