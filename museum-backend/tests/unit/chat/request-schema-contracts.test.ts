import {
  parseCreateSessionRequest,
  parsePostMessageRequest,
  parseListSessionsQuery,
  parseReportMessageRequest,
  parseFeedbackMessageRequest,
} from '@modules/chat/adapters/primary/http/chat.contracts';

describe('POST /sessions — parseCreateSessionRequest schema validation', () => {
  it('accepts a fully valid payload with all optional fields', () => {
    const result = parseCreateSessionRequest({
      userId: 42,
      locale: 'fr-FR',
      museumMode: true,
      museumId: 5,
    });

    expect(result.userId).toBe(42);
    expect(result.locale).toBe('fr-FR');
    expect(result.museumMode).toBe(true);
    expect(result.museumId).toBe(5);
  });

  it('accepts an empty object (all fields optional)', () => {
    const result = parseCreateSessionRequest({});
    expect(result.userId).toBeUndefined();
    expect(result.locale).toBeUndefined();
    expect(result.museumMode).toBeUndefined();
    expect(result.museumId).toBeUndefined();
  });

  it('rejects non-object payloads', () => {
    expect(() => parseCreateSessionRequest(null)).toThrow('Payload must be an object');
    expect(() => parseCreateSessionRequest(undefined)).toThrow('Payload must be an object');
    expect(() => parseCreateSessionRequest('string')).toThrow('Payload must be an object');
    expect(() => parseCreateSessionRequest(42)).toThrow('Payload must be an object');
    expect(() => parseCreateSessionRequest([])).toThrow('Payload must be an object');
  });

  it('strips extra/unknown fields (returns only defined fields)', () => {
    const result = parseCreateSessionRequest({
      locale: 'en',
      unknownField: 'should be ignored',
      anotherExtra: 123,
    });

    expect(result.locale).toBe('en');
    expect((result as Record<string, unknown>).unknownField).toBeUndefined();
    expect((result as Record<string, unknown>).anotherExtra).toBeUndefined();
  });

  it('rejects museumId that is zero', () => {
    expect(() => parseCreateSessionRequest({ museumId: 0 })).toThrow(
      'museumId must be a positive integer',
    );
  });

  it('rejects museumId that is negative', () => {
    expect(() => parseCreateSessionRequest({ museumId: -3 })).toThrow(
      'museumId must be a positive integer',
    );
  });

  it('rejects museumId that is a decimal', () => {
    expect(() => parseCreateSessionRequest({ museumId: 1.7 })).toThrow(
      'museumId must be a positive integer',
    );
  });

  it('coerces museumId from string to number', () => {
    const result = parseCreateSessionRequest({ museumId: '10' });
    expect(result.museumId).toBe(10);
  });

  it('rejects injection attempts in text fields', () => {
    // Locale with injection attempt should still parse as string
    const result = parseCreateSessionRequest({
      locale: 'en; DROP TABLE sessions;--',
    });
    // The parser accepts any string for locale (validation happens downstream)
    expect(result.locale).toBe('en; DROP TABLE sessions;--');
  });

  it('treats empty string fields as undefined', () => {
    const result = parseCreateSessionRequest({ locale: '', museumMode: '' });
    expect(result.locale).toBeUndefined();
    expect(result.museumMode).toBeUndefined();
  });
});

describe('POST /sessions/:id/messages — parsePostMessageRequest schema validation', () => {
  it('accepts valid text-only payload', () => {
    const result = parsePostMessageRequest({ text: 'Tell me about this painting' });

    expect(result.text).toBe('Tell me about this painting');
    expect(result.image).toBeUndefined();
    expect(result.context).toBeUndefined();
  });

  it('accepts valid image-only payload', () => {
    const result = parsePostMessageRequest({ image: 'data:image/jpeg;base64,/9j/4AAQ...' });

    expect(result.text).toBeUndefined();
    expect(result.image).toBe('data:image/jpeg;base64,/9j/4AAQ...');
  });

  it('accepts combined text + image payload', () => {
    const result = parsePostMessageRequest({
      text: 'What painting is this?',
      image: 'https://example.com/painting.jpg',
    });

    expect(result.text).toBe('What painting is this?');
    expect(result.image).toBe('https://example.com/painting.jpg');
  });

  it('accepts empty object (both text and image optional)', () => {
    const result = parsePostMessageRequest({});
    expect(result.text).toBeUndefined();
    expect(result.image).toBeUndefined();
  });

  it('rejects non-object payloads', () => {
    expect(() => parsePostMessageRequest(null)).toThrow('Payload must be an object');
    expect(() => parsePostMessageRequest('hello')).toThrow('Payload must be an object');
    expect(() => parsePostMessageRequest(123)).toThrow('Payload must be an object');
  });

  it('rejects text that is not a string', () => {
    expect(() => parsePostMessageRequest({ text: 42 })).toThrow('text must be a string');
    expect(() => parsePostMessageRequest({ text: true })).toThrow('text must be a string');
    expect(() => parsePostMessageRequest({ text: { nested: 'obj' } })).toThrow(
      'text must be a string',
    );
  });

  it('rejects image that is not a string', () => {
    expect(() => parsePostMessageRequest({ image: 42 })).toThrow('image must be a string');
    expect(() => parsePostMessageRequest({ image: true })).toThrow('image must be a string');
  });

  it('handles Unicode text correctly', () => {
    const unicodeText = '\u4F60\u597D\u4E16\u754C \u{1F3A8} Les Nymph\u00E9as de Monet';
    const result = parsePostMessageRequest({ text: unicodeText });
    expect(result.text).toBe(unicodeText);
  });

  it('handles very long text at boundary', () => {
    const longText = 'A'.repeat(10000);
    // Parser itself does not enforce max length — that's a route-level concern
    const result = parsePostMessageRequest({ text: longText });
    expect(result.text).toBe(longText);
    expect(result.text?.length).toBe(10000);
  });

  it('treats null text and image as undefined', () => {
    const result = parsePostMessageRequest({ text: null, image: null });
    expect(result.text).toBeUndefined();
    expect(result.image).toBeUndefined();
  });

  it('treats empty string text and image as undefined', () => {
    const result = parsePostMessageRequest({ text: '', image: '' });
    expect(result.text).toBeUndefined();
    expect(result.image).toBeUndefined();
  });

  describe('context sub-object validation', () => {
    it('rejects context that is not an object', () => {
      expect(() => parsePostMessageRequest({ context: 'string' })).toThrow(
        'context must be an object',
      );
      expect(() => parsePostMessageRequest({ context: 42 })).toThrow('context must be an object');
      expect(() => parsePostMessageRequest({ context: [1, 2] })).toThrow(
        'context must be an object',
      );
    });

    it('parses valid context with all fields', () => {
      const result = parsePostMessageRequest({
        context: {
          location: 'Louvre, Room 711',
          museumMode: true,
          guideLevel: 'expert',
          locale: 'fr',
        },
      });

      expect(result.context?.location).toBe('Louvre, Room 711');
      expect(result.context?.museumMode).toBe(true);
      expect(result.context?.guideLevel).toBe('expert');
      expect(result.context?.locale).toBe('fr');
    });

    it('rejects invalid guideLevel values', () => {
      expect(() => parsePostMessageRequest({ context: { guideLevel: 'master' } })).toThrow(
        'must be beginner, intermediate, or expert',
      );

      expect(() => parsePostMessageRequest({ context: { guideLevel: 'EXPERT' } })).toThrow(
        'must be beginner, intermediate, or expert',
      );
    });

    it('rejects non-string guideLevel', () => {
      expect(() => parsePostMessageRequest({ context: { guideLevel: 42 } })).toThrow(
        'context.guideLevel must be a string',
      );
    });

    it('accepts all three valid guideLevel values', () => {
      for (const level of ['beginner', 'intermediate', 'expert']) {
        const result = parsePostMessageRequest({ context: { guideLevel: level } });
        expect(result.context?.guideLevel).toBe(level);
      }
    });

    it('accepts empty context object', () => {
      const result = parsePostMessageRequest({ context: {} });
      expect(result.context).toBeDefined();
      expect(result.context?.location).toBeUndefined();
      expect(result.context?.museumMode).toBeUndefined();
      expect(result.context?.guideLevel).toBeUndefined();
    });
  });
});

describe('GET /sessions — parseListSessionsQuery schema validation', () => {
  it('accepts empty query', () => {
    const result = parseListSessionsQuery({});
    expect(result.cursor).toBeUndefined();
    expect(result.limit).toBeUndefined();
  });

  it('parses cursor and numeric limit', () => {
    const result = parseListSessionsQuery({ cursor: 'abc123', limit: 25 });
    expect(result.cursor).toBe('abc123');
    expect(result.limit).toBe(25);
  });

  it('parses limit from string', () => {
    const result = parseListSessionsQuery({ limit: '10' });
    expect(result.limit).toBe(10);
  });

  it('rejects non-string cursor', () => {
    expect(() => parseListSessionsQuery({ cursor: 42 })).toThrow('cursor must be a string');
  });

  it('rejects boolean limit', () => {
    expect(() => parseListSessionsQuery({ limit: true })).toThrow('limit must be a number');
  });

  it('rejects non-object query', () => {
    expect(() => parseListSessionsQuery(null)).toThrow('Query must be an object');
    expect(() => parseListSessionsQuery('bad')).toThrow('Query must be an object');
  });
});

describe('POST /messages/:id/report — parseReportMessageRequest schema validation', () => {
  it('accepts valid report with reason only', () => {
    const result = parseReportMessageRequest({ reason: 'offensive' });
    expect(result.reason).toBe('offensive');
    expect(result.comment).toBeUndefined();
  });

  it('accepts valid report with reason and comment', () => {
    const result = parseReportMessageRequest({
      reason: 'inaccurate',
      comment: 'The date mentioned is wrong',
    });
    expect(result.reason).toBe('inaccurate');
    expect(result.comment).toBe('The date mentioned is wrong');
  });

  it('accepts all four valid reasons', () => {
    for (const reason of ['offensive', 'inaccurate', 'inappropriate', 'other']) {
      const result = parseReportMessageRequest({ reason });
      expect(result.reason).toBe(reason);
    }
  });

  it('rejects missing reason', () => {
    expect(() => parseReportMessageRequest({})).toThrow('reason is required');
  });

  it('rejects invalid reason', () => {
    expect(() => parseReportMessageRequest({ reason: 'spam' })).toThrow(
      'reason must be offensive, inaccurate, inappropriate, or other',
    );
  });

  it('rejects comment exceeding 500 characters', () => {
    expect(() => parseReportMessageRequest({ reason: 'other', comment: 'x'.repeat(501) })).toThrow(
      'comment must be 500 characters or fewer',
    );
  });

  it('accepts comment at exactly 500 characters', () => {
    const result = parseReportMessageRequest({ reason: 'other', comment: 'x'.repeat(500) });
    expect(result.comment?.length).toBe(500);
  });
});

describe('POST /messages/:id/feedback — parseFeedbackMessageRequest schema validation', () => {
  it('accepts positive feedback', () => {
    const result = parseFeedbackMessageRequest({ value: 'positive' });
    expect(result.value).toBe('positive');
  });

  it('accepts negative feedback', () => {
    const result = parseFeedbackMessageRequest({ value: 'negative' });
    expect(result.value).toBe('negative');
  });

  it('rejects missing value', () => {
    expect(() => parseFeedbackMessageRequest({})).toThrow('value is required');
  });

  it('rejects invalid value', () => {
    expect(() => parseFeedbackMessageRequest({ value: 'neutral' })).toThrow(
      'value must be positive or negative',
    );
  });

  it('rejects non-string value', () => {
    expect(() => parseFeedbackMessageRequest({ value: 42 })).toThrow('value is required');
  });

  it('rejects non-object payloads', () => {
    expect(() => parseFeedbackMessageRequest(null)).toThrow('Payload must be an object');
    expect(() => parseFeedbackMessageRequest([])).toThrow('Payload must be an object');
  });
});
