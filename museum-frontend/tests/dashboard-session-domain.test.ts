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
  intent: 'default',
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

  it('DEC-2026-11-09 · has no title when both title and preview are missing (the screen names it)', () => {
    const card = mapSessionToDashboardCard(
      makeSessionItem({
        title: null as unknown as string,
        preview: null as unknown as SessionListItemDTO['preview'],
      }),
    );

    assert.equal(card.title, null);
  });

  it('truncates long titles at 90 characters', () => {
    const longTitle = 'A'.repeat(100);
    const card = mapSessionToDashboardCard(makeSessionItem({ title: longTitle }));

    assert.equal(card.title, `${'A'.repeat(87)}...`);
  });

  it('does not truncate short titles', () => {
    const card = mapSessionToDashboardCard(makeSessionItem({ title: 'Short' }));

    assert.equal(card.title, 'Short');
  });

  it('DEC-2026-11-09 · the subtitle is the museum name alone, never the mode or the locale', () => {
    const card = mapSessionToDashboardCard(
      makeSessionItem({ title: 'Chat', museumName: 'Louvre', museumMode: true, locale: 'fr-FR' }),
    );

    assert.equal(card.subtitle, 'Louvre');
  });

  it('DEC-2026-11-09 · has no subtitle when the museum is already the title', () => {
    const card = mapSessionToDashboardCard(
      makeSessionItem({ title: 'Louvre', museumName: 'Louvre' }),
    );

    assert.equal(card.subtitle, null);
  });

  it('uses preview.createdAt for timeLabel when available', () => {
    const fromPreview = mapSessionToDashboardCard(makeSessionItem({ updatedAt: 'not-a-date' }));

    assert.notEqual(fromPreview.timeLabel, null);
  });

  it('falls back to updatedAt when preview is missing', () => {
    const card = mapSessionToDashboardCard(
      makeSessionItem({ preview: null as unknown as SessionListItemDTO['preview'] }),
    );

    assert.notEqual(card.timeLabel, null);
  });

  it('AUDIT-2026-11-09 · has no timeLabel for an unreadable date', () => {
    const card = mapSessionToDashboardCard(
      makeSessionItem({
        preview: null as unknown as SessionListItemDTO['preview'],
        updatedAt: 'not-a-date',
      }),
    );

    assert.equal(card.timeLabel, null);
  });
});

describe('mapSessionsToDashboardCards', () => {
  it('maps an array of sessions', () => {
    const sessions = [makeSessionItem({ id: 'a' }), makeSessionItem({ id: 'b' })];
    const cards = mapSessionsToDashboardCards(sessions);

    assert.equal(cards.length, 2);
    assert.equal(cards[0]?.id, 'a');
    assert.equal(cards[1]?.id, 'b');
  });

  it('returns empty array for empty input', () => {
    const cards = mapSessionsToDashboardCards([]);
    assert.equal(cards.length, 0);
  });
});
