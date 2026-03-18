import { buildChatTestService } from 'tests/helpers/chat/chatTestApp';

describe('chat service input validation', () => {
  describe('createSession', () => {
    it('rejects userId = 0', async () => {
      const service = buildChatTestService();
      await expect(service.createSession({ userId: 0 })).rejects.toThrow(
        expect.objectContaining({ statusCode: 400 }),
      );
    });

    it('rejects userId = -1', async () => {
      const service = buildChatTestService();
      await expect(service.createSession({ userId: -1 })).rejects.toThrow(
        expect.objectContaining({ statusCode: 400 }),
      );
    });

    it('rejects non-integer userId = 1.5', async () => {
      const service = buildChatTestService();
      await expect(service.createSession({ userId: 1.5 })).rejects.toThrow(
        expect.objectContaining({ statusCode: 400 }),
      );
    });
  });

  describe('postMessage', () => {
    it('rejects when neither text nor image is provided', async () => {
      const service = buildChatTestService();
      const session = await service.createSession({});

      await expect(service.postMessage(session.id, {})).rejects.toThrow(
        expect.objectContaining({
          statusCode: 400,
          message: expect.stringContaining('text or image'),
        }),
      );
    });

    it('rejects text exceeding max length', async () => {
      const service = buildChatTestService();
      const session = await service.createSession({});
      const longText = 'a'.repeat(3000);

      await expect(
        service.postMessage(session.id, { text: longText }),
      ).rejects.toThrow(expect.objectContaining({ statusCode: 400 }));
    });

    it('rejects image URL with http (not https)', async () => {
      const service = buildChatTestService();
      const session = await service.createSession({});

      await expect(
        service.postMessage(session.id, {
          text: 'Check this artwork',
          image: { source: 'url', value: 'http://example.com/img.jpg' },
        }),
      ).rejects.toThrow(expect.objectContaining({ statusCode: 400 }));
    });

    it('rejects uploaded image with unsupported MIME type', async () => {
      const service = buildChatTestService();
      const session = await service.createSession({});

      await expect(
        service.postMessage(session.id, {
          text: 'Check this',
          image: {
            source: 'upload',
            value: 'aGVsbG8=',
            mimeType: 'image/gif',
            sizeBytes: 100,
          },
        }),
      ).rejects.toThrow(expect.objectContaining({ statusCode: 400 }));
    });

    it('rejects uploaded image exceeding max size', async () => {
      const service = buildChatTestService();
      const session = await service.createSession({});

      await expect(
        service.postMessage(session.id, {
          text: 'Check this',
          image: {
            source: 'upload',
            value: 'aGVsbG8=',
            mimeType: 'image/jpeg',
            sizeBytes: 10 * 1024 * 1024,
          },
        }),
      ).rejects.toThrow(expect.objectContaining({ statusCode: 400 }));
    });

    it('rejects uploaded image without mimeType', async () => {
      const service = buildChatTestService();
      const session = await service.createSession({});

      await expect(
        service.postMessage(session.id, {
          text: 'Check this',
          image: {
            source: 'upload',
            value: 'aGVsbG8=',
            mimeType: undefined as unknown as string,
            sizeBytes: 100,
          },
        }),
      ).rejects.toThrow(expect.objectContaining({ statusCode: 400 }));
    });

    it('rejects uploaded image without sizeBytes', async () => {
      const service = buildChatTestService();
      const session = await service.createSession({});

      await expect(
        service.postMessage(session.id, {
          text: 'Check this',
          image: {
            source: 'upload',
            value: 'aGVsbG8=',
            mimeType: 'image/jpeg',
            sizeBytes: undefined as unknown as number,
          },
        }),
      ).rejects.toThrow(expect.objectContaining({ statusCode: 400 }));
    });

    it('rejects invalid session id format', async () => {
      const service = buildChatTestService();

      await expect(
        service.postMessage('not-a-uuid', { text: 'Hello' }),
      ).rejects.toThrow(expect.objectContaining({ statusCode: 400 }));
    });
  });

  describe('listSessions', () => {
    it('rejects without currentUserId', async () => {
      const service = buildChatTestService();

      await expect(
        service.listSessions({ limit: 20 }, undefined),
      ).rejects.toThrow(expect.objectContaining({ statusCode: 400 }));
    });

    it('rejects currentUserId = 0', async () => {
      const service = buildChatTestService();

      await expect(
        service.listSessions({ limit: 20 }, 0),
      ).rejects.toThrow(expect.objectContaining({ statusCode: 400 }));
    });

    it('rejects invalid cursor format', async () => {
      const service = buildChatTestService();

      await expect(
        service.listSessions({ limit: 20, cursor: 'not-valid-base64-cursor' }, 1),
      ).rejects.toThrow(expect.objectContaining({ statusCode: 400 }));
    });
  });

  describe('postAudioMessage', () => {
    it('rejects empty audio base64', async () => {
      const service = buildChatTestService();
      const session = await service.createSession({});

      await expect(
        service.postAudioMessage(session.id, {
          audio: { base64: '  ', mimeType: 'audio/mp3', sizeBytes: 100 },
        }),
      ).rejects.toThrow(expect.objectContaining({ statusCode: 400 }));
    });

    it('rejects empty audio mimeType', async () => {
      const service = buildChatTestService();
      const session = await service.createSession({});

      await expect(
        service.postAudioMessage(session.id, {
          audio: { base64: 'dGVzdA==', mimeType: '  ', sizeBytes: 100 },
        }),
      ).rejects.toThrow(expect.objectContaining({ statusCode: 400 }));
    });

    it('rejects audio exceeding max size', async () => {
      const service = buildChatTestService();
      const session = await service.createSession({});

      await expect(
        service.postAudioMessage(session.id, {
          audio: { base64: 'dGVzdA==', mimeType: 'audio/mp3', sizeBytes: 20 * 1024 * 1024 },
        }),
      ).rejects.toThrow(expect.objectContaining({ statusCode: 400 }));
    });

    it('rejects unsupported audio mimeType', async () => {
      const service = buildChatTestService();
      const session = await service.createSession({});

      await expect(
        service.postAudioMessage(session.id, {
          audio: { base64: 'dGVzdA==', mimeType: 'audio/flac', sizeBytes: 100 },
        }),
      ).rejects.toThrow(expect.objectContaining({ statusCode: 400 }));
    });

    it('rejects invalid session id format', async () => {
      const service = buildChatTestService();

      await expect(
        service.postAudioMessage('not-a-uuid', {
          audio: { base64: 'dGVzdA==', mimeType: 'audio/mp3', sizeBytes: 100 },
        }),
      ).rejects.toThrow(expect.objectContaining({ statusCode: 400 }));
    });
  });
});
