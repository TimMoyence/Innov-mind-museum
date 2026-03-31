import {
  parseCreateSessionRequest,
  parsePostMessageRequest,
  parseListSessionsQuery,
  parseReportMessageRequest,
  parseFeedbackMessageRequest,
  isCreateSessionResponse,
  isPostMessageResponse,
  isPostAudioMessageResponse,
  isGetSessionResponse,
  isDeleteSessionResponse,
  isListSessionsResponse,
  isReportMessageResponse,
  isFeedbackMessageResponse,
} from '@modules/chat/adapters/primary/http/chat.contracts';

describe('parseCreateSessionRequest — branch coverage', () => {
  it('throws when payload is not an object', () => {
    expect(() => parseCreateSessionRequest('string')).toThrow('Payload must be an object');
    expect(() => parseCreateSessionRequest(null)).toThrow('Payload must be an object');
    expect(() => parseCreateSessionRequest([])).toThrow('Payload must be an object');
  });

  it('accepts empty object', () => {
    const result = parseCreateSessionRequest({});
    expect(result).toEqual({});
  });

  it('parses museumMode as boolean string "true"', () => {
    const result = parseCreateSessionRequest({ museumMode: 'true' });
    expect(result.museumMode).toBe(true);
  });

  it('parses museumMode as boolean string "false"', () => {
    const result = parseCreateSessionRequest({ museumMode: 'false' });
    expect(result.museumMode).toBe(false);
  });

  it('throws for museumMode with invalid string value', () => {
    expect(() => parseCreateSessionRequest({ museumMode: 'yes' })).toThrow('must be a boolean');
  });

  it('throws for museumMode with non-boolean/string type', () => {
    expect(() => parseCreateSessionRequest({ museumMode: 42 })).toThrow('must be a boolean');
  });

  it('parses museumId as number', () => {
    const result = parseCreateSessionRequest({ museumId: 5 });
    expect(result.museumId).toBe(5);
  });

  it('parses museumId as numeric string', () => {
    const result = parseCreateSessionRequest({ museumId: '7' });
    expect(result.museumId).toBe(7);
  });

  it('throws for museumId that is not a positive integer', () => {
    expect(() => parseCreateSessionRequest({ museumId: -1 })).toThrow(
      'museumId must be a positive integer',
    );
    expect(() => parseCreateSessionRequest({ museumId: 0 })).toThrow(
      'museumId must be a positive integer',
    );
    expect(() => parseCreateSessionRequest({ museumId: 1.5 })).toThrow(
      'museumId must be a positive integer',
    );
  });

  it('throws for museumId with non-numeric value', () => {
    expect(() => parseCreateSessionRequest({ museumId: 'abc' })).toThrow('must be a number');
  });

  it('handles null/empty values as undefined', () => {
    const result = parseCreateSessionRequest({ locale: null, museumMode: null, userId: '' });
    expect(result.locale).toBeUndefined();
    expect(result.museumMode).toBeUndefined();
    expect(result.userId).toBeUndefined();
  });

  it('throws when locale is not a string', () => {
    expect(() => parseCreateSessionRequest({ locale: 123 })).toThrow('locale must be a string');
  });

  it('throws when userId is not a number', () => {
    expect(() => parseCreateSessionRequest({ userId: true })).toThrow('must be a number');
  });
});

describe('parsePostMessageRequest — branch coverage', () => {
  it('throws for non-object payload', () => {
    expect(() => parsePostMessageRequest(42)).toThrow('Payload must be an object');
  });

  it('accepts minimal payload', () => {
    const result = parsePostMessageRequest({});
    expect(result.text).toBeUndefined();
    expect(result.image).toBeUndefined();
    expect(result.context).toBeUndefined();
  });

  it('parses text and image', () => {
    const result = parsePostMessageRequest({ text: 'hello', image: 'https://img.jpg' });
    expect(result.text).toBe('hello');
    expect(result.image).toBe('https://img.jpg');
  });

  it('throws when context is not an object', () => {
    expect(() => parsePostMessageRequest({ context: 'bad' })).toThrow('context must be an object');
    expect(() => parsePostMessageRequest({ context: [1, 2] })).toThrow('context must be an object');
  });

  it('parses context with all fields', () => {
    const result = parsePostMessageRequest({
      context: {
        location: 'Room A',
        museumMode: true,
        guideLevel: 'expert',
        locale: 'fr',
      },
    });
    expect(result.context).toEqual({
      location: 'Room A',
      museumMode: true,
      guideLevel: 'expert',
      locale: 'fr',
    });
  });

  it('throws when context.guideLevel is not a string', () => {
    expect(() => parsePostMessageRequest({ context: { guideLevel: 123 } })).toThrow(
      'context.guideLevel must be a string',
    );
  });

  it('throws when context.guideLevel is invalid value', () => {
    expect(() => parsePostMessageRequest({ context: { guideLevel: 'master' } })).toThrow(
      'must be beginner, intermediate, or expert',
    );
  });

  it('accepts null/empty guideLevel as undefined', () => {
    const result = parsePostMessageRequest({ context: { guideLevel: null } });
    expect(result.context?.guideLevel).toBeUndefined();

    const result2 = parsePostMessageRequest({ context: { guideLevel: '' } });
    expect(result2.context?.guideLevel).toBeUndefined();
  });

  it('parses context.museumMode as string "true"/"false"', () => {
    const result = parsePostMessageRequest({ context: { museumMode: 'true' } });
    expect(result.context?.museumMode).toBe(true);

    const result2 = parsePostMessageRequest({ context: { museumMode: 'false' } });
    expect(result2.context?.museumMode).toBe(false);
  });

  it('throws for context.museumMode with invalid type', () => {
    expect(() => parsePostMessageRequest({ context: { museumMode: 42 } })).toThrow(
      'must be a boolean',
    );
  });

  it('throws when text is not a string', () => {
    expect(() => parsePostMessageRequest({ text: 123 })).toThrow('text must be a string');
  });

  it('throws when image is not a string', () => {
    expect(() => parsePostMessageRequest({ image: true })).toThrow('image must be a string');
  });
});

describe('parseListSessionsQuery — branch coverage', () => {
  it('throws for non-object input', () => {
    expect(() => parseListSessionsQuery(null)).toThrow('Query must be an object');
  });

  it('accepts empty query', () => {
    const result = parseListSessionsQuery({});
    expect(result.cursor).toBeUndefined();
    expect(result.limit).toBeUndefined();
  });

  it('parses cursor and limit', () => {
    const result = parseListSessionsQuery({ cursor: 'abc', limit: '10' });
    expect(result.cursor).toBe('abc');
    expect(result.limit).toBe(10);
  });

  it('throws when cursor is not a string', () => {
    expect(() => parseListSessionsQuery({ cursor: 123 })).toThrow('cursor must be a string');
  });

  it('throws when limit is invalid type', () => {
    expect(() => parseListSessionsQuery({ limit: true })).toThrow('limit must be a number');
  });

  it('handles limit as number', () => {
    const result = parseListSessionsQuery({ limit: 25 });
    expect(result.limit).toBe(25);
  });

  it('handles limit as empty string', () => {
    const result = parseListSessionsQuery({ limit: '' });
    expect(result.limit).toBeUndefined();
  });
});

describe('parseReportMessageRequest — branch coverage', () => {
  it('throws for non-object payload', () => {
    expect(() => parseReportMessageRequest(null)).toThrow('Payload must be an object');
  });

  it('throws when reason is missing', () => {
    expect(() => parseReportMessageRequest({})).toThrow('reason is required');
  });

  it('throws when reason is empty string', () => {
    expect(() => parseReportMessageRequest({ reason: '  ' })).toThrow('reason is required');
  });

  it('throws when reason is not an allowed value', () => {
    expect(() => parseReportMessageRequest({ reason: 'spam' })).toThrow(
      'reason must be offensive, inaccurate, inappropriate, or other',
    );
  });

  it('parses valid reason without comment', () => {
    const result = parseReportMessageRequest({ reason: 'offensive' });
    expect(result.reason).toBe('offensive');
    expect(result.comment).toBeUndefined();
  });

  it('parses all valid reasons', () => {
    for (const reason of ['offensive', 'inaccurate', 'inappropriate', 'other']) {
      const result = parseReportMessageRequest({ reason });
      expect(result.reason).toBe(reason);
    }
  });

  it('parses valid reason with comment', () => {
    const result = parseReportMessageRequest({ reason: 'inaccurate', comment: 'Wrong date' });
    expect(result.comment).toBe('Wrong date');
  });

  it('throws when comment exceeds 500 chars', () => {
    const longComment = 'a'.repeat(501);
    expect(() => parseReportMessageRequest({ reason: 'other', comment: longComment })).toThrow(
      'comment must be 500 characters or fewer',
    );
  });

  it('accepts comment at exactly 500 chars', () => {
    const comment = 'a'.repeat(500);
    const result = parseReportMessageRequest({ reason: 'other', comment });
    expect(result.comment).toBe(comment);
  });

  it('throws when reason is not a string', () => {
    expect(() => parseReportMessageRequest({ reason: 42 })).toThrow('reason is required');
  });
});

describe('type guard — negative branch coverage', () => {
  describe('isCreateSessionResponse', () => {
    it('returns false for non-object', () => {
      expect(isCreateSessionResponse(null)).toBe(false);
      expect(isCreateSessionResponse('string')).toBe(false);
    });

    it('returns false when session is not an object', () => {
      expect(isCreateSessionResponse({ session: 'not-obj' })).toBe(false);
    });

    it('returns false when required fields are missing', () => {
      expect(isCreateSessionResponse({ session: { id: 'x' } })).toBe(false);
      expect(isCreateSessionResponse({ session: { id: 'x', museumMode: true } })).toBe(false);
    });
  });

  describe('isPostMessageResponse', () => {
    it('returns false for non-object', () => {
      expect(isPostMessageResponse(null)).toBe(false);
    });

    it('returns false when message or metadata is missing', () => {
      expect(isPostMessageResponse({ sessionId: 's1', message: {}, metadata: null })).toBe(false);
      expect(isPostMessageResponse({ sessionId: 's1' })).toBe(false);
    });

    it('returns false when message has wrong role', () => {
      expect(
        isPostMessageResponse({
          sessionId: 's1',
          message: { id: 'm1', role: 'user', text: 'hi', createdAt: 'now' },
          metadata: {},
        }),
      ).toBe(false);
    });

    it('returns false when citations is not a string array', () => {
      expect(
        isPostMessageResponse({
          sessionId: 's1',
          message: { id: 'm1', role: 'assistant', text: 'hi', createdAt: 'now' },
          metadata: { citations: [1, 2, 3] },
        }),
      ).toBe(false);
    });

    it('returns false when sessionId is not a string', () => {
      expect(
        isPostMessageResponse({
          sessionId: 123,
          message: { id: 'm1', role: 'assistant', text: 'hi', createdAt: 'now' },
          metadata: {},
        }),
      ).toBe(false);
    });
  });

  describe('isPostAudioMessageResponse', () => {
    it('returns false when base message is invalid', () => {
      expect(isPostAudioMessageResponse(null)).toBe(false);
    });

    it('returns false when transcription is missing', () => {
      expect(
        isPostAudioMessageResponse({
          sessionId: 's1',
          message: { id: 'm1', role: 'assistant', text: 'hi', createdAt: 'now' },
          metadata: {},
        }),
      ).toBe(false);
    });

    it('returns false when transcription has wrong provider', () => {
      expect(
        isPostAudioMessageResponse({
          sessionId: 's1',
          message: { id: 'm1', role: 'assistant', text: 'hi', createdAt: 'now' },
          metadata: {},
          transcription: { text: 'hi', model: 'gpt-4', provider: 'anthropic' },
        }),
      ).toBe(false);
    });

    it('returns false when transcription.text is not a string', () => {
      expect(
        isPostAudioMessageResponse({
          sessionId: 's1',
          message: { id: 'm1', role: 'assistant', text: 'hi', createdAt: 'now' },
          metadata: {},
          transcription: { text: 123, model: 'gpt-4', provider: 'openai' },
        }),
      ).toBe(false);
    });
  });

  describe('isGetSessionResponse', () => {
    it('returns false for non-object', () => {
      expect(isGetSessionResponse(null)).toBe(false);
    });

    it('returns false when session or messages or page is missing', () => {
      expect(isGetSessionResponse({ session: {}, messages: [] })).toBe(false);
      expect(isGetSessionResponse({ session: {}, page: {} })).toBe(false);
    });

    it('returns false when session fields are wrong type', () => {
      expect(
        isGetSessionResponse({
          session: { id: 123, museumMode: true, createdAt: 'now', updatedAt: 'now' },
          messages: [],
          page: { nextCursor: null, hasMore: false, limit: 20 },
        }),
      ).toBe(false);
    });

    it('returns false when page fields are wrong type', () => {
      expect(
        isGetSessionResponse({
          session: { id: 's1', museumMode: true, createdAt: 'now', updatedAt: 'now' },
          messages: [],
          page: { nextCursor: null, hasMore: 'yes', limit: 20 },
        }),
      ).toBe(false);
    });

    it('returns false when page.limit is not a number', () => {
      expect(
        isGetSessionResponse({
          session: { id: 's1', museumMode: true, createdAt: 'now', updatedAt: 'now' },
          messages: [],
          page: { nextCursor: null, hasMore: false, limit: 'twenty' },
        }),
      ).toBe(false);
    });

    it('returns false when page.nextCursor is invalid type', () => {
      expect(
        isGetSessionResponse({
          session: { id: 's1', museumMode: true, createdAt: 'now', updatedAt: 'now' },
          messages: [],
          page: { nextCursor: 123, hasMore: false, limit: 20 },
        }),
      ).toBe(false);
    });

    it('returns false when a message item is not an object', () => {
      expect(
        isGetSessionResponse({
          session: { id: 's1', museumMode: true, createdAt: 'now', updatedAt: 'now' },
          messages: ['not an object'],
          page: { nextCursor: null, hasMore: false, limit: 20 },
        }),
      ).toBe(false);
    });

    it('returns false when message has invalid image object', () => {
      expect(
        isGetSessionResponse({
          session: { id: 's1', museumMode: true, createdAt: 'now', updatedAt: 'now' },
          messages: [{ id: 'm1', role: 'user', createdAt: 'now', image: 'not-an-object' }],
          page: { nextCursor: null, hasMore: false, limit: 20 },
        }),
      ).toBe(false);
    });

    it('returns false when message.image has missing url', () => {
      expect(
        isGetSessionResponse({
          session: { id: 's1', museumMode: true, createdAt: 'now', updatedAt: 'now' },
          messages: [
            { id: 'm1', role: 'user', createdAt: 'now', image: { url: 123, expiresAt: 'later' } },
          ],
          page: { nextCursor: null, hasMore: false, limit: 20 },
        }),
      ).toBe(false);
    });

    it('returns false when message.image has wrong expiresAt type', () => {
      expect(
        isGetSessionResponse({
          session: { id: 's1', museumMode: true, createdAt: 'now', updatedAt: 'now' },
          messages: [
            {
              id: 'm1',
              role: 'user',
              createdAt: 'now',
              image: { url: 'http://img', expiresAt: 123 },
            },
          ],
          page: { nextCursor: null, hasMore: false, limit: 20 },
        }),
      ).toBe(false);
    });

    it('returns true when message has null image', () => {
      expect(
        isGetSessionResponse({
          session: { id: 's1', museumMode: true, createdAt: 'now', updatedAt: 'now' },
          messages: [{ id: 'm1', role: 'user', createdAt: 'now', image: null }],
          page: { nextCursor: null, hasMore: false, limit: 20 },
        }),
      ).toBe(true);
    });

    it('returns false when message id is not a string', () => {
      expect(
        isGetSessionResponse({
          session: { id: 's1', museumMode: true, createdAt: 'now', updatedAt: 'now' },
          messages: [{ id: 123, role: 'user', createdAt: 'now' }],
          page: { nextCursor: null, hasMore: false, limit: 20 },
        }),
      ).toBe(false);
    });
  });

  describe('isDeleteSessionResponse', () => {
    it('returns false for non-object', () => {
      expect(isDeleteSessionResponse(null)).toBe(false);
    });

    it('returns false when sessionId is not a string', () => {
      expect(isDeleteSessionResponse({ sessionId: 123, deleted: true })).toBe(false);
    });

    it('returns false when deleted is not a boolean', () => {
      expect(isDeleteSessionResponse({ sessionId: 's1', deleted: 'yes' })).toBe(false);
    });
  });

  describe('isReportMessageResponse', () => {
    it('returns false for non-object', () => {
      expect(isReportMessageResponse(null)).toBe(false);
    });

    it('returns false when fields have wrong types', () => {
      expect(isReportMessageResponse({ messageId: 123, reported: true })).toBe(false);
      expect(isReportMessageResponse({ messageId: 'm1', reported: 'yes' })).toBe(false);
    });

    it('returns true for valid report response', () => {
      expect(isReportMessageResponse({ messageId: 'm1', reported: true })).toBe(true);
    });
  });

  describe('isListSessionsResponse', () => {
    it('returns false for non-object', () => {
      expect(isListSessionsResponse(null)).toBe(false);
    });

    it('returns false when sessions is not an array', () => {
      expect(
        isListSessionsResponse({
          sessions: 'bad',
          page: { nextCursor: null, hasMore: false, limit: 10 },
        }),
      ).toBe(false);
    });

    it('returns false when page is missing', () => {
      expect(isListSessionsResponse({ sessions: [] })).toBe(false);
    });

    it('returns false when page.hasMore is not boolean', () => {
      expect(
        isListSessionsResponse({
          sessions: [],
          page: { nextCursor: null, hasMore: 'yes', limit: 10 },
        }),
      ).toBe(false);
    });

    it('returns false when page.nextCursor is invalid type (not null or string)', () => {
      expect(
        isListSessionsResponse({
          sessions: [],
          page: { nextCursor: 123, hasMore: false, limit: 10 },
        }),
      ).toBe(false);
    });

    it('returns false when page.limit is not a number', () => {
      expect(
        isListSessionsResponse({
          sessions: [],
          page: { nextCursor: null, hasMore: false, limit: 'ten' },
        }),
      ).toBe(false);
    });

    it('returns false when session item has wrong field types', () => {
      expect(
        isListSessionsResponse({
          sessions: [
            { id: 123, museumMode: true, createdAt: 'now', updatedAt: 'now', messageCount: 0 },
          ],
          page: { nextCursor: null, hasMore: false, limit: 10 },
        }),
      ).toBe(false);
    });

    it('returns false when session item has non-numeric messageCount', () => {
      expect(
        isListSessionsResponse({
          sessions: [
            {
              id: 's1',
              museumMode: true,
              createdAt: 'now',
              updatedAt: 'now',
              messageCount: 'three',
            },
          ],
          page: { nextCursor: null, hasMore: false, limit: 10 },
        }),
      ).toBe(false);
    });

    it('returns false when session item is not an object', () => {
      expect(
        isListSessionsResponse({
          sessions: ['not-obj'],
          page: { nextCursor: null, hasMore: false, limit: 10 },
        }),
      ).toBe(false);
    });

    it('returns false when preview has wrong types', () => {
      expect(
        isListSessionsResponse({
          sessions: [
            {
              id: 's1',
              museumMode: true,
              createdAt: 'now',
              updatedAt: 'now',
              messageCount: 1,
              preview: { text: 123, createdAt: 'now', role: 'user' },
            },
          ],
          page: { nextCursor: null, hasMore: false, limit: 10 },
        }),
      ).toBe(false);
    });

    it('returns false when preview is not an object', () => {
      expect(
        isListSessionsResponse({
          sessions: [
            {
              id: 's1',
              museumMode: true,
              createdAt: 'now',
              updatedAt: 'now',
              messageCount: 1,
              preview: 'not-obj',
            },
          ],
          page: { nextCursor: null, hasMore: false, limit: 10 },
        }),
      ).toBe(false);
    });

    it('returns false when preview.role is invalid', () => {
      expect(
        isListSessionsResponse({
          sessions: [
            {
              id: 's1',
              museumMode: true,
              createdAt: 'now',
              updatedAt: 'now',
              messageCount: 1,
              preview: { text: 'hi', createdAt: 'now', role: 'bot' },
            },
          ],
          page: { nextCursor: null, hasMore: false, limit: 10 },
        }),
      ).toBe(false);
    });
  });
});

describe('parseFeedbackMessageRequest — branch coverage', () => {
  it('throws for non-object payload', () => {
    expect(() => parseFeedbackMessageRequest(null)).toThrow('Payload must be an object');
    expect(() => parseFeedbackMessageRequest('string')).toThrow('Payload must be an object');
    expect(() => parseFeedbackMessageRequest([])).toThrow('Payload must be an object');
  });

  it('throws when value is missing', () => {
    expect(() => parseFeedbackMessageRequest({})).toThrow('value is required');
  });

  it('throws when value is empty string', () => {
    expect(() => parseFeedbackMessageRequest({ value: '  ' })).toThrow('value is required');
  });

  it('throws when value is not a string', () => {
    expect(() => parseFeedbackMessageRequest({ value: 42 })).toThrow('value is required');
  });

  it('throws when value is not positive or negative', () => {
    expect(() => parseFeedbackMessageRequest({ value: 'neutral' })).toThrow(
      'value must be positive or negative',
    );
  });

  it('parses positive value', () => {
    const result = parseFeedbackMessageRequest({ value: 'positive' });
    expect(result).toEqual({ value: 'positive' });
  });

  it('parses negative value', () => {
    const result = parseFeedbackMessageRequest({ value: 'negative' });
    expect(result).toEqual({ value: 'negative' });
  });
});

describe('isFeedbackMessageResponse — branch coverage', () => {
  it('returns false for non-object', () => {
    expect(isFeedbackMessageResponse(null)).toBe(false);
    expect(isFeedbackMessageResponse('string')).toBe(false);
    expect(isFeedbackMessageResponse(undefined)).toBe(false);
  });

  it('returns false when messageId is not a string', () => {
    expect(isFeedbackMessageResponse({ messageId: 123, status: 'created' })).toBe(false);
  });

  it('returns false when status is not a string', () => {
    expect(isFeedbackMessageResponse({ messageId: 'm1', status: 42 })).toBe(false);
  });

  it('returns false when status is not a valid value', () => {
    expect(isFeedbackMessageResponse({ messageId: 'm1', status: 'unknown' })).toBe(false);
  });

  it('returns true for valid created response', () => {
    expect(isFeedbackMessageResponse({ messageId: 'm1', status: 'created' })).toBe(true);
  });

  it('returns true for valid updated response', () => {
    expect(isFeedbackMessageResponse({ messageId: 'm1', status: 'updated' })).toBe(true);
  });

  it('returns true for valid removed response', () => {
    expect(isFeedbackMessageResponse({ messageId: 'm1', status: 'removed' })).toBe(true);
  });
});
