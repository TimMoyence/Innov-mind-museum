import {
  toLocalImageFileName,
  sanitizeObjectKeySegment,
  buildChatImageObjectKey,
  withPolicyCitation,
  isValidSessionListCursor,
  resolveLocalImageMeta,
} from '@modules/chat/useCase/image/chat-image.helpers';
import type { ChatAssistantMetadata } from '@modules/chat/domain/chat.types';

describe('toLocalImageFileName', () => {
  it('extracts filename from local:// ref', () => {
    expect(toLocalImageFileName('local://abc123.jpg')).toBe('abc123.jpg');
  });

  it('returns null for non-local ref', () => {
    expect(toLocalImageFileName('s3://key.jpg')).toBeNull();
    expect(toLocalImageFileName('https://example.com/img.jpg')).toBeNull();
  });

  it('returns null for empty local ref', () => {
    expect(toLocalImageFileName('local://')).toBeNull();
  });
});

describe('sanitizeObjectKeySegment', () => {
  it('keeps alphanumerics, dots, underscores, hyphens', () => {
    expect(sanitizeObjectKeySegment('abc-123_test.jpg')).toBe('abc-123_test.jpg');
  });

  it('replaces unsafe characters with underscore', () => {
    expect(sanitizeObjectKeySegment('path/to file!@#')).toBe('path_to_file___');
  });
});

describe('buildChatImageObjectKey', () => {
  it('builds key with userId', () => {
    const key = buildChatImageObjectKey({
      mimeType: 'image/jpeg',
      sessionId: 'sess-1',
      userId: 42,
      now: new Date('2024-03-15T12:00:00Z'),
    });

    expect(key).toContain('chat-images/2024/03/user-42/session-sess-1/');
    expect(key).toMatch(/\.jpg$/);
  });

  it('uses user-anonymous when userId is not provided', () => {
    const key = buildChatImageObjectKey({
      mimeType: 'image/png',
      sessionId: 'sess-2',
      now: new Date('2024-06-01'),
    });

    expect(key).toContain('user-anonymous');
    expect(key).toMatch(/\.png$/);
  });

  it('uses user-anonymous for userId <= 0', () => {
    const key = buildChatImageObjectKey({
      mimeType: 'image/webp',
      sessionId: 'sess-3',
      userId: 0,
    });

    expect(key).toContain('user-anonymous');
  });

  it('uses user-anonymous for non-integer userId', () => {
    const key = buildChatImageObjectKey({
      mimeType: 'image/jpeg',
      sessionId: 'sess-4',
      userId: 1.5,
    });

    expect(key).toContain('user-anonymous');
  });

  it('defaults to .img for unknown MIME type', () => {
    const key = buildChatImageObjectKey({
      mimeType: 'image/tiff',
      sessionId: 'sess-5',
    });

    expect(key).toMatch(/\.img$/);
  });
});

describe('withPolicyCitation', () => {
  it('returns metadata unchanged when no reason given', () => {
    const meta: ChatAssistantMetadata = { citations: ['test'] };
    const result = withPolicyCitation(meta, undefined);
    expect(result).toBe(meta);
  });

  it('appends policy citation for valid reason', () => {
    const meta: ChatAssistantMetadata = {};
    const result = withPolicyCitation(meta, 'off_topic');
    expect(result.citations).toContain('policy:off_topic');
  });

  it('does not duplicate citation', () => {
    const meta: ChatAssistantMetadata = { citations: ['policy:off_topic'] };
    const result = withPolicyCitation(meta, 'off_topic');
    expect(result.citations?.filter((c) => c === 'policy:off_topic')).toHaveLength(1);
  });

  it('appends to existing citations', () => {
    const meta: ChatAssistantMetadata = { citations: ['existing'] };
    const result = withPolicyCitation(meta, 'insult');
    expect(result.citations).toContain('existing');
    expect(result.citations).toContain('policy:insult');
  });
});

describe('isValidSessionListCursor', () => {
  it('returns true for valid cursor', () => {
    const cursor = Buffer.from(JSON.stringify({ updatedAt: '2024-01-01', id: 'abc' })).toString(
      'base64url',
    );
    expect(isValidSessionListCursor(cursor)).toBe(true);
  });

  it('returns false for invalid base64', () => {
    expect(isValidSessionListCursor('not-valid-base64!!!')).toBe(false);
  });

  it('returns false for non-object decoded value', () => {
    const cursor = Buffer.from('"just a string"').toString('base64url');
    expect(isValidSessionListCursor(cursor)).toBe(false);
  });

  it('returns false when missing required fields', () => {
    const cursor = Buffer.from(JSON.stringify({ updatedAt: '2024-01-01' })).toString('base64url');
    expect(isValidSessionListCursor(cursor)).toBe(false);
  });

  it('returns false for null decoded value', () => {
    const cursor = Buffer.from('null').toString('base64url');
    expect(isValidSessionListCursor(cursor)).toBe(false);
  });
});

describe('resolveLocalImageMeta', () => {
  it('resolves meta for local jpg image', () => {
    const meta = resolveLocalImageMeta('local://test.jpg');
    expect(meta).toEqual({ fileName: 'test.jpg', contentType: 'image/jpeg' });
  });

  it('resolves meta for local png image', () => {
    const meta = resolveLocalImageMeta('local://test.png');
    expect(meta).toEqual({ fileName: 'test.png', contentType: 'image/png' });
  });

  it('resolves meta for local webp image', () => {
    const meta = resolveLocalImageMeta('local://test.webp');
    expect(meta).toEqual({ fileName: 'test.webp', contentType: 'image/webp' });
  });

  it('resolves with undefined contentType for unknown extension', () => {
    const meta = resolveLocalImageMeta('local://test.bmp');
    expect(meta).toEqual({ fileName: 'test.bmp', contentType: undefined });
  });

  it('returns null for non-local ref', () => {
    expect(resolveLocalImageMeta('s3://key.jpg')).toBeNull();
  });
});
