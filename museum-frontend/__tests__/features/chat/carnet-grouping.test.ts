/**
 * Red tests for B1 — pure functions :
 *   - `groupSessionsByMuseumAndDate` (features/chat/domain/carnet.ts)
 *   - `buildVisitCarnetDetail` (features/chat/application/chatSessionLogic.pure.ts)
 *
 * Asserts the contract documented in `docs/chat-ux-refonte/specs/B1.md` :
 *
 *   §1.1 R3-R4 — group precedence + sort.
 *   §1.1 R5 — title precedence (`title` → `lastArtworkTitle` → `preview.text` → fallback).
 *   §1.1 R6 — `dateLabel` via Intl Date.toLocaleString (no third-party lib).
 *   §1.5 R30-R33 — `buildVisitCarnetDetail` purity + composition.
 *   §4 AC1, AC3, AC9, AC13 — invariants.
 *
 * At baseline (B1 not yet implemented) :
 *   - `@/features/chat/domain/carnet` does NOT exist
 *     (verified : `ls museum-frontend/features/chat/domain/carnet*` → 0).
 *   - `buildVisitCarnetDetail` is NOT exported from `chatSessionLogic.pure.ts`
 *     (verified : `grep -n buildVisitCarnetDetail` → 0 hits).
 *   → Jest fails with "Cannot find module" / "is not a function".
 *
 * Spec : `docs/chat-ux-refonte/specs/B1.md` §1.1 R3-R6 ; §1.5 R30-R33 ; §4 AC1, AC3, AC9, AC13.
 */

import {
  buildVisitCarnetDetail,
  type VisitCarnetDetail,
} from '@/features/chat/application/chatSessionLogic.pure';
import { groupSessionsByMuseumAndDate, type VisitCarnetGroup } from '@/features/chat/domain/carnet';

import { makeAssistantMessage, makeChatUiMessage } from '../../helpers/factories/chat.factories';
import { makeListSessionsResponse } from '../../helpers/factories/session.factories';
import type { SessionListItemDTO } from '@/features/chat/domain/contracts';

const at = (offsetSeconds: number): string =>
  new Date(Date.UTC(2026, 3, 27, 14, 0, offsetSeconds)).toISOString();

function makeItem(overrides: Partial<SessionListItemDTO>): SessionListItemDTO {
  const base = makeListSessionsResponse().sessions[0];
  if (!base) throw new Error('factory returned empty sessions');
  return { ...base, messageCount: 3, ...overrides };
}

describe('groupSessionsByMuseumAndDate (B1 pure §1.1 R3-R4 §4 AC1)', () => {
  it('groups by museumId first when defined (AC1)', () => {
    const sessions: SessionListItemDTO[] = [
      makeItem({
        id: 's1',
        museumId: 12,
        museumName: 'Louvre',
        updatedAt: '2026-04-21T12:00:00.000Z',
      }),
      makeItem({
        id: 's2',
        museumId: 12,
        museumName: 'Louvre',
        updatedAt: '2026-04-20T12:00:00.000Z',
      }),
      makeItem({
        id: 's3',
        museumId: 14,
        museumName: 'Orsay',
        updatedAt: '2026-04-22T12:00:00.000Z',
      }),
    ];

    const groups: VisitCarnetGroup[] = groupSessionsByMuseumAndDate(sessions, 'en-US');

    expect(groups.length).toBe(2);
    // Orsay (s3 = 22 apr) before Louvre (max(21, 20) = 21 apr)
    expect(groups[0]?.museumKey).toBe('museumId:14');
    expect(groups[1]?.museumKey).toBe('museumId:12');
    // Louvre sessions sorted DESC by updatedAt within
    expect(groups[1]?.sessions.map((s) => s.id)).toEqual(['s1', 's2']);
  });

  it('falls back to museumName when museumId is null (case-insensitive trim)', () => {
    const sessions: SessionListItemDTO[] = [
      makeItem({
        id: 'a',
        museumId: null,
        museumName: '  louvre  ',
        updatedAt: '2026-04-21T12:00:00.000Z',
      }),
      makeItem({
        id: 'b',
        museumId: null,
        museumName: 'LOUVRE',
        updatedAt: '2026-04-22T12:00:00.000Z',
      }),
    ];

    const groups = groupSessionsByMuseumAndDate(sessions, 'en-US');
    expect(groups.length).toBe(1);
    expect(groups[0]?.museumKey).toMatch(/^museumName:/);
    expect(groups[0]?.sessions.map((s) => s.id)).toEqual(['b', 'a']);
  });

  it('uses key "unknown" when both museumId and museumName are null/empty', () => {
    const sessions: SessionListItemDTO[] = [
      makeItem({
        id: 's4',
        museumId: null,
        museumName: null,
        updatedAt: '2026-04-19T12:00:00.000Z',
      }),
    ];

    const groups = groupSessionsByMuseumAndDate(sessions, 'en-US');
    expect(groups.length).toBe(1);
    expect(groups[0]?.museumKey).toBe('unknown');
  });

  describe('title precedence (R5, AC3)', () => {
    it('uses session.title when defined', () => {
      const sessions: SessionListItemDTO[] = [
        makeItem({ id: 'a', title: 'Visite samedi', lastArtworkTitle: 'X' }),
      ];
      const groups = groupSessionsByMuseumAndDate(sessions, 'en-US');
      expect(groups[0]?.sessions[0]?.title).toBe('Visite samedi');
    });

    it('falls back to lastArtworkTitle when title is null', () => {
      const sessions: SessionListItemDTO[] = [
        makeItem({ id: 'a', title: null, lastArtworkTitle: 'La Joconde' }),
      ];
      const groups = groupSessionsByMuseumAndDate(sessions, 'en-US');
      expect(groups[0]?.sessions[0]?.title).toBe('La Joconde');
    });

    it('falls back to preview.text when both title and lastArtworkTitle are null', () => {
      const sessions: SessionListItemDTO[] = [
        makeItem({
          id: 'a',
          title: null,
          lastArtworkTitle: null,
          preview: {
            text: 'A long preview message about something interesting',
            createdAt: '2026-04-21T12:00:00.000Z',
            role: 'assistant',
          },
        }),
      ];
      const groups = groupSessionsByMuseumAndDate(sessions, 'en-US');
      expect(groups[0]?.sessions[0]?.title).toBe(
        'A long preview message about something interesting',
      );
    });

    it('truncates preview.text fallback to ≤ 90 chars', () => {
      const long = 'a'.repeat(200);
      const sessions: SessionListItemDTO[] = [
        makeItem({
          id: 'a',
          title: null,
          lastArtworkTitle: null,
          preview: {
            text: long,
            createdAt: '2026-04-21T12:00:00.000Z',
            role: 'assistant',
          },
        }),
      ];
      const groups = groupSessionsByMuseumAndDate(sessions, 'en-US');
      expect((groups[0]?.sessions[0]?.title ?? '').length).toBeLessThanOrEqual(90);
    });

    it('falls back to i18n key carnet.untitledSession when nothing is available', () => {
      const sessions: SessionListItemDTO[] = [
        makeItem({
          id: 'a',
          title: null,
          lastArtworkTitle: null,
          preview: undefined,
        }),
      ];
      const groups = groupSessionsByMuseumAndDate(sessions, 'en-US');
      // Pure function returns the i18n KEY (the screen does the actual translation).
      expect(groups[0]?.sessions[0]?.title).toBe('carnet.untitledSession');
    });
  });

  describe('dateLabel (R6)', () => {
    it('produces a non-empty locale-aware label without throwing', () => {
      const sessions: SessionListItemDTO[] = [
        makeItem({ id: 'a', updatedAt: '2026-04-21T12:00:00.000Z' }),
      ];
      const groups = groupSessionsByMuseumAndDate(sessions, 'en-US');
      const card = groups[0]?.sessions[0];
      expect(typeof card?.dateLabel).toBe('string');
      expect(card?.dateLabel.length).toBeGreaterThan(0);
    });
  });

  describe('purity (AC13)', () => {
    it('is deterministic — same input → strictly equal output across calls', () => {
      const sessions: SessionListItemDTO[] = [
        makeItem({
          id: 's1',
          museumId: 12,
          museumName: 'Louvre',
          updatedAt: '2026-04-21T12:00:00.000Z',
        }),
        makeItem({
          id: 's2',
          museumId: 14,
          museumName: 'Orsay',
          updatedAt: '2026-04-22T12:00:00.000Z',
        }),
      ];

      const a = groupSessionsByMuseumAndDate(sessions, 'en-US');
      const b = groupSessionsByMuseumAndDate(sessions, 'en-US');
      expect(a).toStrictEqual(b);
    });
  });
});

describe('buildVisitCarnetDetail (B1 pure §1.5 R30-R33 §4 AC9, AC13)', () => {
  it('returns { summary, transcript, dateLabel, durationLabel } shape (R31)', () => {
    const session = {
      id: 'sess-1',
      locale: 'en-US',
      museumMode: true,
      museumName: 'Louvre',
      title: null,
      createdAt: at(0),
      updatedAt: at(0),
      intent: 'default' as const,
    };
    const messages = [
      makeChatUiMessage({ role: 'user', createdAt: at(0), text: 'Photo' }),
      makeAssistantMessage(
        { createdAt: at(30) },
        {
          detectedArtwork: {
            title: 'La Joconde',
            artist: 'Léonard',
            museum: 'Louvre',
          },
        },
      ),
    ];

    const detail: VisitCarnetDetail = buildVisitCarnetDetail(session, messages, 'en-US');

    expect(detail).toEqual(
      expect.objectContaining({
        summary: expect.objectContaining({
          artworks: expect.any(Array),
          museumName: expect.any(String),
        }),
        transcript: expect.any(Array),
        dateLabel: expect.any(String),
        durationLabel: expect.any(String),
      }),
    );
  });

  it('dedupes artworks by title (AC9)', () => {
    const session = {
      id: 'sess-1',
      locale: 'en-US',
      museumMode: true,
      museumName: 'Louvre',
      title: null,
      createdAt: at(0),
      updatedAt: at(0),
      intent: 'default' as const,
    };
    const messages = [
      makeAssistantMessage(
        { createdAt: at(10) },
        { detectedArtwork: { title: 'La Joconde', museum: 'Louvre' } },
      ),
      makeAssistantMessage(
        { createdAt: at(20) },
        { detectedArtwork: { title: 'La Joconde', museum: 'Louvre' } },
      ),
      makeAssistantMessage(
        { createdAt: at(30) },
        { detectedArtwork: { title: 'Vermeer Liseuse', museum: 'Louvre' } },
      ),
    ];

    const detail = buildVisitCarnetDetail(session, messages, 'en-US');
    expect(detail.summary.artworks.length).toBe(2);
    expect(detail.summary.artworks.map((a) => a.title)).toEqual(['La Joconde', 'Vermeer Liseuse']);
  });

  it('transcript is sorted chronologically ASC', () => {
    const session = {
      id: 'sess-1',
      locale: 'en-US',
      museumMode: true,
      museumName: 'Louvre',
      title: null,
      createdAt: at(0),
      updatedAt: at(0),
      intent: 'default' as const,
    };
    const messages = [
      makeChatUiMessage({ id: 'm3', role: 'user', createdAt: at(300) }),
      makeChatUiMessage({ id: 'm1', role: 'user', createdAt: at(0) }),
      makeChatUiMessage({ id: 'm2', role: 'assistant', createdAt: at(150) }),
    ];

    const detail = buildVisitCarnetDetail(session, messages, 'en-US');
    expect(detail.transcript.map((m) => m.id)).toEqual(['m1', 'm2', 'm3']);
  });

  it('is pure — same input → strictly equal output (AC13)', () => {
    const session = {
      id: 'sess-1',
      locale: 'en-US',
      museumMode: true,
      museumName: 'Louvre',
      title: null,
      createdAt: at(0),
      updatedAt: at(0),
      intent: 'default' as const,
    };
    const messages = [
      makeAssistantMessage(
        { createdAt: at(10) },
        { detectedArtwork: { title: 'La Joconde', museum: 'Louvre' } },
      ),
    ];

    const a = buildVisitCarnetDetail(session, messages, 'en-US');
    const b = buildVisitCarnetDetail(session, messages, 'en-US');
    expect(a).toStrictEqual(b);
  });
});
