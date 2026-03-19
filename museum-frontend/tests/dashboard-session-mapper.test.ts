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

test('prefers session title over preview text and shows museumName in subtitle', () => {
  const now = new Date().toISOString();
  const card = mapSessionToDashboardCard(
    {
      id: 'session-99',
      locale: 'fr-FR',
      museumMode: true,
      title: 'Mona Lisa',
      museumName: 'Louvre',
      createdAt: now,
      updatedAt: now,
      messageCount: 3,
      preview: { text: 'Tell me about this painting', createdAt: now, role: 'user' },
    },
    'fr-FR',
  );

  assert.equal(card.title, 'Mona Lisa');
  assert.match(card.subtitle, /Guided mode/);
  assert.match(card.subtitle, /Louvre/);
  assert.match(card.subtitle, /fr-FR/);
});

test('falls back to preview text when session title is null', () => {
  const now = new Date().toISOString();
  const card = mapSessionToDashboardCard(
    {
      id: 'session-100',
      museumMode: false,
      title: null,
      museumName: null,
      createdAt: now,
      updatedAt: now,
      messageCount: 1,
      preview: { text: 'What is this sculpture?', createdAt: now, role: 'user' },
    },
    'en-US',
  );

  assert.equal(card.title, 'What is this sculpture?');
  assert.match(card.subtitle, /Standard mode/);
});

test('omits museumName from subtitle when it equals the title (prevents duplication)', () => {
  const now = new Date().toISOString();
  const card = mapSessionToDashboardCard(
    {
      id: 'session-200',
      locale: 'fr-FR',
      museumMode: true,
      title: 'Louvre',
      museumName: 'Louvre',
      createdAt: now,
      updatedAt: now,
      messageCount: 5,
      preview: { text: 'Tell me about the Mona Lisa', createdAt: now, role: 'user' },
    },
    'fr-FR',
  );

  assert.equal(card.title, 'Louvre');
  assert.match(card.subtitle, /Guided mode/);
  // museumName should NOT appear in subtitle since it equals the title
  assert.doesNotMatch(card.subtitle, /Louvre/);
  assert.match(card.subtitle, /fr-FR/);
});

test('shows museumName in subtitle when it differs from title', () => {
  const now = new Date().toISOString();
  const card = mapSessionToDashboardCard(
    {
      id: 'session-201',
      locale: 'en-US',
      museumMode: true,
      title: 'Mona Lisa — Leonardo da Vinci',
      museumName: 'Louvre',
      createdAt: now,
      updatedAt: now,
      messageCount: 3,
      preview: { text: 'Tell me about this painting', createdAt: now, role: 'user' },
    },
    'en-US',
  );

  assert.equal(card.title, 'Mona Lisa — Leonardo da Vinci');
  assert.match(card.subtitle, /Louvre/);
});
