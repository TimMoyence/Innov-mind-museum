import {
  clearMessageAudio,
  findLegacyImageRefsByUserId,
  updateMessageAudio,
} from '@modules/chat/adapters/secondary/persistence/chat-repository-audio';
import {
  deleteMessageFeedback,
  getMessageFeedback,
  upsertMessageFeedback,
} from '@modules/chat/adapters/secondary/persistence/chat-repository-feedback';

import type { ChatMessage } from '@modules/chat/domain/message/chatMessage.entity';
import type { MessageFeedback } from '@modules/chat/domain/message/messageFeedback.entity';
import type { Repository } from 'typeorm';

const buildFeedbackRepoMock = () => {
  const execute = jest.fn().mockResolvedValue(undefined);
  const orUpdate = jest.fn().mockReturnValue({ execute });
  const values = jest.fn().mockReturnValue({ orUpdate });
  const into = jest.fn().mockReturnValue({ values });
  const insert = jest.fn().mockReturnValue({ into });
  const createQueryBuilder = jest.fn().mockReturnValue({ insert });

  const findOne = jest.fn();
  const deleteFn = jest.fn().mockResolvedValue({ affected: 1 });

  const repo = {
    createQueryBuilder,
    findOne,
    delete: deleteFn,
  } as unknown as Repository<MessageFeedback>;

  return {
    repo,
    mocks: { execute, orUpdate, values, into, insert, createQueryBuilder, findOne, deleteFn },
  };
};

const buildMessageRepoMock = () => {
  const update = jest.fn().mockResolvedValue({ affected: 1 });
  const getRawMany = jest.fn();
  const andWhere = jest.fn().mockReturnThis();
  const where = jest.fn().mockReturnThis();
  const innerJoin = jest.fn().mockReturnThis();
  const select = jest.fn().mockReturnThis();
  const qb = { select, innerJoin, where, andWhere, getRawMany };
  const createQueryBuilder = jest.fn().mockReturnValue(qb);
  const repo = {
    update,
    createQueryBuilder,
  } as unknown as Repository<ChatMessage>;
  return {
    repo,
    mocks: { update, createQueryBuilder, getRawMany, andWhere, where, innerJoin, select },
  };
};

describe('chat-repository-feedback', () => {
  it('upsertMessageFeedback emits an INSERT … ON CONFLICT statement', async () => {
    const { repo, mocks } = buildFeedbackRepoMock();
    await upsertMessageFeedback(repo, 'msg-1', 7, 'positive');
    expect(mocks.createQueryBuilder).toHaveBeenCalledTimes(1);
    expect(mocks.values).toHaveBeenCalledWith({ messageId: 'msg-1', userId: 7, value: 'positive' });
    expect(mocks.orUpdate).toHaveBeenCalledWith(['value'], ['messageId', 'userId']);
    expect(mocks.execute).toHaveBeenCalledTimes(1);
  });

  it('deleteMessageFeedback uses the flat composite-key where clause', async () => {
    const { repo, mocks } = buildFeedbackRepoMock();
    await deleteMessageFeedback(repo, 'msg-2', 9);
    expect(mocks.deleteFn).toHaveBeenCalledWith({ messageId: 'msg-2', userId: 9 });
  });

  it('getMessageFeedback returns the value when present', async () => {
    const { repo, mocks } = buildFeedbackRepoMock();
    mocks.findOne.mockResolvedValue({ value: 'positive' });
    const result = await getMessageFeedback(repo, 'msg-3', 10);
    expect(result).toEqual({ value: 'positive' });
    expect(mocks.findOne).toHaveBeenCalledWith({
      where: { messageId: 'msg-3', userId: 10 },
      select: ['value'],
    });
  });

  it('getMessageFeedback returns null when missing', async () => {
    const { repo, mocks } = buildFeedbackRepoMock();
    mocks.findOne.mockResolvedValue(null);
    const result = await getMessageFeedback(repo, 'msg-3', 11);
    expect(result).toBeNull();
  });
});

describe('chat-repository-audio', () => {
  it('updateMessageAudio writes the three audio columns', async () => {
    const { repo, mocks } = buildMessageRepoMock();
    const generatedAt = new Date('2026-05-05T00:00:00Z');
    await updateMessageAudio(repo, 'msg-9', {
      audioUrl: 's3://bucket/audio.mp3',
      audioGeneratedAt: generatedAt,
      audioVoice: 'alloy',
    });
    expect(mocks.update).toHaveBeenCalledWith(
      { id: 'msg-9' },
      {
        audioUrl: 's3://bucket/audio.mp3',
        audioGeneratedAt: generatedAt,
        audioVoice: 'alloy',
      },
    );
  });

  it('clearMessageAudio nulls the three audio columns', async () => {
    const { repo, mocks } = buildMessageRepoMock();
    await clearMessageAudio(repo, 'msg-12');
    expect(mocks.update).toHaveBeenCalledWith(
      { id: 'msg-12' },
      { audioUrl: null, audioGeneratedAt: null, audioVoice: null },
    );
  });

  it('findLegacyImageRefsByUserId returns deduplicated non-null refs', async () => {
    const { repo, mocks } = buildMessageRepoMock();
    mocks.getRawMany.mockResolvedValue([
      { imageRef: 's3://a' },
      { imageRef: 's3://b' },
      { imageRef: 's3://a' },
      { imageRef: null },
      { imageRef: '' },
    ]);
    const refs = await findLegacyImageRefsByUserId(repo, 42);
    expect(refs).toEqual(['s3://a', 's3://b']);
  });

  it('findLegacyImageRefsByUserId returns empty array when no rows', async () => {
    const { repo, mocks } = buildMessageRepoMock();
    mocks.getRawMany.mockResolvedValue([]);
    const refs = await findLegacyImageRefsByUserId(repo, 7);
    expect(refs).toEqual([]);
  });
});
