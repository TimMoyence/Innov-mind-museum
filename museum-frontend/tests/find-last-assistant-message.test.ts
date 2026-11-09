import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { findLastAssistantMessage } from '../features/chat/application/chatSessionLogic.pure';
import type { ChatUiMessage } from '../features/chat/application/chatSessionLogic.pure';

const message = (id: string, role: ChatUiMessage['role']): ChatUiMessage => ({
  id,
  role,
  text: id,
  createdAt: '2026-11-09T10:00:00.000Z',
  image: null,
});

describe('findLastAssistantMessage', () => {
  it('returns null for an empty conversation', () => {
    assert.equal(findLastAssistantMessage([]), null);
  });

  it('returns null when the assistant has not answered yet', () => {
    assert.equal(findLastAssistantMessage([message('u1', 'user'), message('u2', 'user')]), null);
  });

  it('returns the latest assistant message even when the user spoke after it', () => {
    const latest = message('a2', 'assistant');
    const messages = [message('a1', 'assistant'), latest, message('u1', 'user')];

    assert.equal(findLastAssistantMessage(messages), latest);
  });
});
