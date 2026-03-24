import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  sortByTime,
  mapApiMessageToUiMessage,
  buildOptimisticMessage,
} from '../features/chat/application/chatSessionLogic.pure';
import type { ChatUiMessage, ApiMessage } from '../features/chat/application/chatSessionLogic.pure';

describe('sortByTime', () => {
  it('sorts messages by createdAt ascending', () => {
    const messages: ChatUiMessage[] = [
      { id: '3', role: 'user', text: 'third', createdAt: '2026-01-03T00:00:00Z', image: null },
      { id: '1', role: 'user', text: 'first', createdAt: '2026-01-01T00:00:00Z', image: null },
      { id: '2', role: 'assistant', text: 'second', createdAt: '2026-01-02T00:00:00Z', image: null },
    ];

    const sorted = sortByTime(messages);

    assert.equal(sorted[0].id, '1');
    assert.equal(sorted[1].id, '2');
    assert.equal(sorted[2].id, '3');
  });

  it('does not mutate the original array', () => {
    const messages: ChatUiMessage[] = [
      { id: 'b', role: 'user', text: 'b', createdAt: '2026-01-02T00:00:00Z', image: null },
      { id: 'a', role: 'user', text: 'a', createdAt: '2026-01-01T00:00:00Z', image: null },
    ];

    const sorted = sortByTime(messages);

    assert.equal(messages[0].id, 'b', 'original array should be unchanged');
    assert.equal(sorted[0].id, 'a');
  });

  it('handles empty array', () => {
    const sorted = sortByTime([]);
    assert.deepEqual(sorted, []);
  });

  it('handles single element', () => {
    const messages: ChatUiMessage[] = [
      { id: '1', role: 'user', text: 'only', createdAt: '2026-01-01T00:00:00Z', image: null },
    ];

    const sorted = sortByTime(messages);
    assert.equal(sorted.length, 1);
    assert.equal(sorted[0].id, '1');
  });
});

describe('mapApiMessageToUiMessage', () => {
  it('maps a full API message to UI format', () => {
    const apiMsg: ApiMessage = {
      id: 'msg-1',
      role: 'assistant',
      text: 'Hello',
      createdAt: '2026-01-01T12:00:00Z',
      imageRef: 'ref-abc',
      image: { url: 'https://example.com/img.jpg', expiresAt: '2026-01-02T00:00:00Z' },
      metadata: { detectedArtwork: { title: 'Mona Lisa' } },
    };

    const uiMsg = mapApiMessageToUiMessage(apiMsg);

    assert.equal(uiMsg.id, 'msg-1');
    assert.equal(uiMsg.role, 'assistant');
    assert.equal(uiMsg.text, 'Hello');
    assert.equal(uiMsg.createdAt, '2026-01-01T12:00:00Z');
    assert.equal(uiMsg.imageRef, 'ref-abc');
    assert.deepEqual(uiMsg.image, { url: 'https://example.com/img.jpg', expiresAt: '2026-01-02T00:00:00Z' });
    assert.deepEqual(uiMsg.metadata, { detectedArtwork: { title: 'Mona Lisa' } });
  });

  it('defaults text to empty string when undefined', () => {
    const apiMsg: ApiMessage = {
      id: 'msg-2',
      role: 'user',
      createdAt: '2026-01-01T00:00:00Z',
    };

    const uiMsg = mapApiMessageToUiMessage(apiMsg);
    assert.equal(uiMsg.text, '');
  });

  it('defaults image and metadata to null when missing', () => {
    const apiMsg: ApiMessage = {
      id: 'msg-3',
      role: 'system',
      text: 'Welcome',
      createdAt: '2026-01-01T00:00:00Z',
    };

    const uiMsg = mapApiMessageToUiMessage(apiMsg);
    assert.equal(uiMsg.image, null);
    assert.equal(uiMsg.metadata, null);
  });
});

describe('buildOptimisticMessage', () => {
  it('builds a user message with trimmed text', () => {
    const msg = buildOptimisticMessage('  Hello world  ', undefined);

    assert.equal(msg.role, 'user');
    assert.equal(msg.text, 'Hello world');
    assert.ok(msg.id.endsWith('-user'));
    assert.equal(msg.image, null);
  });

  it('uses "[Image sent]" when text is empty and imageUri is provided', () => {
    const msg = buildOptimisticMessage('', 'file:///photo.jpg');

    assert.equal(msg.text, '[Image sent]');
  });

  it('uses empty string when both text and imageUri are undefined', () => {
    const msg = buildOptimisticMessage(undefined, undefined);

    assert.equal(msg.text, '');
  });

  it('sets createdAt to a valid ISO date string', () => {
    const before = new Date().toISOString();
    const msg = buildOptimisticMessage('test', undefined);
    const after = new Date().toISOString();

    assert.ok(msg.createdAt >= before);
    assert.ok(msg.createdAt <= after);
  });
});
