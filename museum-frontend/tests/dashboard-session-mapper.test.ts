import test from 'node:test';
import assert from 'node:assert/strict';

import {
  mapSessionToDashboardCard,
  mapSessionsToDashboardCards,
} from '../features/chat/domain/dashboard-session';

test('maps chat session to dashboard card', () => {
  const now = new Date().toISOString();
  const card = mapSessionToDashboardCard(
    {
      id: 'session-42',
      locale: 'en-US',
      museumMode: true,
      createdAt: now,
      updatedAt: now,
      messageCount: 4,
      preview: {
        text: 'Tell me about the artwork style and symbolism.',
        createdAt: now,
        role: 'assistant',
      },
    },
    'en-US',
  );

  assert.equal(card.id, 'session-42');
  assert.equal(card.messageCount, 4);
  assert.match(card.subtitle, /Guided mode/);
  assert.ok(card.title.length > 0);
  assert.ok(card.timeLabel.length > 0);
});

test('maps empty preview session to fallback title', () => {
  const now = new Date().toISOString();
  const cards = mapSessionsToDashboardCards(
    [
      {
        id: 'session-10',
        museumMode: false,
        createdAt: now,
        updatedAt: now,
        messageCount: 0,
      },
    ],
    'en-US',
  );

  assert.equal(cards.length, 1);
  assert.equal(cards[0].title, 'No messages yet');
  assert.match(cards[0].subtitle, /Standard mode/);
});
