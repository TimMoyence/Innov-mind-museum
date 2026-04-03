import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  mapSessionToDashboardCard,
  mapSessionsToDashboardCards,
} from '../features/chat/domain/dashboard-session';
import type { SessionListItemDTO } from '../features/chat/domain/contracts';

const makeSessionItem = (overrides: Partial<SessionListItemDTO> = {}): SessionListItemDTO => ({
  id: 'session-1',
  locale: 'en-US',
  museumMode: false,
  title: 'Test Session',
  museumName: null,
  createdAt: '2026-03-15T10:00:00.000Z',
  updatedAt: '2026-03-15T10:30:00.000Z',
  messageCount: 5,
  preview: {
    text: 'Last message text',
    createdAt: '2026-03-15T10:30:00.000Z',
    role: 'assistant',
  },
  ...overrides,
});

describe('mapSessionToDashboardCard', () => {
  it('maps basic session fields', () => {
    const card = mapSessionToDashboardCard(makeSessionItem());

    assert.equal(card.id, 'session-1');
    assert.equal(card.title, 'Test Session');
    assert.equal(card.messageCount, 5);
  });

  it('falls back to preview text when title is null', () => {
    const card = mapSessionToDashboardCard(makeSessionItem({ title: null as unknown as string }));

    assert.equal(card.title, 'Last message text');
  });

  it('falls back to "No messages yet" when both title and preview are null', () => {
    const card = mapSessionToDashboardCard(
      makeSessionItem({
        title: null as unknown as string,
        preview: null as unknown as SessionListItemDTO['preview'],
      }),
    );

    assert.equal(card.title, 'No messages yet');
  });

  it('truncates long titles at 90 characters', () => {
    const longTitle = 'A'.repeat(100);
    const card = mapSessionToDashboardCard(makeSessionItem({ title: longTitle }));

    assert.equal(card.title.length, 90);
    assert.ok(card.title.endsWith('...'));
  });

  it('does not truncate short titles', () => {
    const card = mapSessionToDashboardCard(makeSessionItem({ title: 'Short' }));

    assert.equal(card.title, 'Short');
  });

  it('shows "Guided mode" for museumMode sessions', () => {
    const card = mapSessionToDashboardCard(makeSessionItem({ museumMode: true }));

    assert.ok(card.subtitle.includes('Guided mode'));
  });

  it('shows "Standard mode" for non-museumMode sessions', () => {
    const card = mapSessionToDashboardCard(makeSessionItem({ museumMode: false }));

    assert.ok(card.subtitle.includes('Standard mode'));
  });

  it('includes museumName in subtitle when different from title', () => {
    const card = mapSessionToDashboardCard(
      makeSessionItem({ title: 'Chat', museumName: 'Louvre' }),
    );

    assert.ok(card.subtitle.includes('Louvre'));
  });

  it('skips museumName from subtitle when same as title', () => {
    const card = mapSessionToDashboardCard(
      makeSessionItem({ title: 'Louvre', museumName: 'Louvre' }),
    );

    assert.ok(!card.subtitle.includes('Louvre'));
  });

  it('uses preview.createdAt for timeLabel when available', () => {
    const card = mapSessionToDashboardCard(makeSessionItem());

    assert.ok(card.timeLabel !== 'Unknown time');
  });

  it('falls back to updatedAt when preview is missing', () => {
    const card = mapSessionToDashboardCard(
      makeSessionItem({ preview: null as unknown as SessionListItemDTO['preview'] }),
    );

    assert.ok(card.timeLabel !== 'Unknown time');
  });

  it('returns "Unknown time" for invalid date', () => {
    const card = mapSessionToDashboardCard(
      makeSessionItem({
        preview: null as unknown as SessionListItemDTO['preview'],
        updatedAt: 'not-a-date',
      }),
    );

    assert.equal(card.timeLabel, 'Unknown time');
  });
});

describe('mapSessionsToDashboardCards', () => {
  it('maps an array of sessions', () => {
    const sessions = [makeSessionItem({ id: 'a' }), makeSessionItem({ id: 'b' })];
    const cards = mapSessionsToDashboardCards(sessions);

    assert.equal(cards.length, 2);
    assert.equal(cards[0].id, 'a');
    assert.equal(cards[1].id, 'b');
  });

  it('returns empty array for empty input', () => {
    const cards = mapSessionsToDashboardCards([]);
    assert.equal(cards.length, 0);
  });
});
