/**
 * P4 — Visit summary parcours utilisateur réel.
 *
 * `buildVisitSummary` is the proactive end-of-visit summary the app renders
 * in `VisitSummaryModal`. The user-facing claim is "Musaium proactif aux
 * transitions (fin de visite → résumé)" — this suite tests the aggregation
 * end-to-end on real session shapes (ordered messages, multiple artworks,
 * deduped titles, expertise progression, room collection).
 *
 * Inline fixtures forbidden — uses `makeChatUiMessage` /
 * `makeAssistantMessage` factories per UFR-002.
 */

import {
  buildVisitSummary,
  type ChatUiMessage,
} from '@/features/chat/application/chatSessionLogic.pure';
import { makeAssistantMessage, makeChatUiMessage } from '../../helpers/factories/chat.factories';

const at = (offsetSeconds: number): string =>
  new Date(Date.UTC(2026, 3, 27, 14, 0, offsetSeconds)).toISOString();

describe('buildVisitSummary — proactive end-of-visit aggregation (P4)', () => {
  it('aggregates artworks, rooms, and museum from a multi-turn visit', () => {
    const messages: ChatUiMessage[] = [
      makeChatUiMessage({ role: 'user', createdAt: at(0), text: 'Photo of a painting' }),
      makeAssistantMessage(
        { createdAt: at(30) },
        {
          detectedArtwork: {
            title: 'La Joconde',
            artist: 'Léonard de Vinci',
            museum: 'Musée du Louvre',
            room: 'Salle des États',
            confidence: 0.97,
          },
          expertiseSignal: 'beginner',
        },
      ),
      makeChatUiMessage({ role: 'user', createdAt: at(120), text: 'And this one?' }),
      makeAssistantMessage(
        { createdAt: at(150) },
        {
          detectedArtwork: {
            title: 'Le Radeau de la Méduse',
            artist: 'Géricault',
            museum: 'Musée du Louvre',
            room: 'Galerie Mollien',
            confidence: 0.92,
          },
          expertiseSignal: 'intermediate',
        },
      ),
      makeChatUiMessage({ role: 'user', createdAt: at(600), text: 'Bye' }),
    ];

    const summary = buildVisitSummary(messages, 'Loose visit name');

    expect(summary.museumName).toBe('Musée du Louvre');
    expect(summary.artworks.map((a) => a.title)).toEqual(['La Joconde', 'Le Radeau de la Méduse']);
    expect(summary.roomsVisited).toEqual(['Salle des États', 'Galerie Mollien']);
    expect(summary.duration.minutes).toBe(10);
    expect(summary.duration.startedAt).toBe(at(0));
    expect(summary.duration.endedAt).toBe(at(600));
    expect(summary.messageCount).toBe(5);
    // Last expertiseSignal observed wins.
    expect(summary.expertiseLevel).toBe('intermediate');
  });

  it('deduplicates artworks when the user re-photographs the same piece', () => {
    const messages: ChatUiMessage[] = [
      makeAssistantMessage(
        { createdAt: at(0) },
        {
          detectedArtwork: {
            title: 'La Joconde',
            artist: 'Léonard de Vinci',
            museum: 'Louvre',
            room: 'Salle des États',
            confidence: 0.95,
          },
        },
      ),
      makeAssistantMessage(
        { createdAt: at(60) },
        {
          detectedArtwork: {
            title: 'La Joconde',
            artist: 'Léonard de Vinci',
            museum: 'Louvre',
            room: 'Salle des États',
            confidence: 0.99,
          },
        },
      ),
    ];

    const summary = buildVisitSummary(messages, null);

    expect(summary.artworks).toHaveLength(1);
    expect(summary.artworks[0].title).toBe('La Joconde');
    expect(summary.roomsVisited).toEqual(['Salle des États']);
  });

  it('falls back to the session title when no museum is detected', () => {
    const messages: ChatUiMessage[] = [
      makeAssistantMessage(
        { createdAt: at(0) },
        {
          detectedArtwork: {
            title: 'Anonymous bronze',
            confidence: 0.4,
            // No museum / no room — common at outdoor monuments.
          },
        },
      ),
    ];

    const summary = buildVisitSummary(messages, 'Roman trip 2026');

    expect(summary.museumName).toBe('Roman trip 2026');
    expect(summary.roomsVisited).toEqual([]);
  });

  it('orders artworks by message timestamp not by array order', () => {
    const messages: ChatUiMessage[] = [
      makeAssistantMessage(
        { createdAt: at(200) },
        {
          detectedArtwork: {
            title: 'Second',
            confidence: 0.8,
            museum: 'X',
            room: 'B',
          },
        },
      ),
      makeAssistantMessage(
        { createdAt: at(100) },
        {
          detectedArtwork: {
            title: 'First',
            confidence: 0.8,
            museum: 'X',
            room: 'A',
          },
        },
      ),
    ];

    const summary = buildVisitSummary(messages, null);

    expect(summary.artworks.map((a) => a.title)).toEqual(['First', 'Second']);
    expect(summary.roomsVisited).toEqual(['A', 'B']);
  });

  it('includes the artwork thumbnail when the assistant message attached an image', () => {
    const messages: ChatUiMessage[] = [
      makeAssistantMessage(
        { createdAt: at(0) },
        {
          detectedArtwork: {
            title: 'Sunflowers',
            artist: 'Van Gogh',
            museum: 'Van Gogh Museum',
            room: 'Hall A',
            confidence: 0.99,
          },
          images: [
            {
              url: 'https://example.com/sunflowers.jpg',
              thumbnailUrl: 'https://example.com/sunflowers-thumb.jpg',
              alt: 'Sunflowers',
            },
          ],
        },
      ),
    ];

    const summary = buildVisitSummary(messages, null);

    expect(summary.artworks[0].imageUrl).toBe('https://example.com/sunflowers-thumb.jpg');
  });

  it('falls back to the full-size url when no thumbnail variant is available', () => {
    const messages: ChatUiMessage[] = [
      makeAssistantMessage(
        { createdAt: at(0) },
        {
          detectedArtwork: {
            title: 'Bronze Hercules',
            artist: 'Anonymous',
            museum: 'Vatican Museums',
            room: 'Sala Rotonda',
            confidence: 0.85,
          },
          images: [
            {
              url: 'https://example.com/hercules.jpg',
              thumbnailUrl: undefined,
              alt: 'Bronze Hercules',
            },
          ],
        },
      ),
    ];

    const summary = buildVisitSummary(messages, null);

    expect(summary.artworks[0].imageUrl).toBe('https://example.com/hercules.jpg');
  });

  it('returns 0 minutes and now-based timestamps for an empty session', () => {
    const before = Date.now();
    const summary = buildVisitSummary([], 'Untitled');
    const after = Date.now();

    expect(summary.museumName).toBe('Untitled');
    expect(summary.artworks).toEqual([]);
    expect(summary.roomsVisited).toEqual([]);
    expect(summary.duration.minutes).toBe(0);
    expect(summary.messageCount).toBe(0);
    expect(summary.expertiseLevel).toBeNull();

    const startedAt = Date.parse(summary.duration.startedAt);
    expect(startedAt).toBeGreaterThanOrEqual(before);
    expect(startedAt).toBeLessThanOrEqual(after);
    expect(summary.duration.endedAt).toBe(summary.duration.startedAt);
  });

  it('ignores user messages and assistant messages without metadata', () => {
    const messages: ChatUiMessage[] = [
      makeChatUiMessage({ role: 'user', createdAt: at(0), text: 'hi' }),
      makeChatUiMessage({ role: 'assistant', createdAt: at(60), text: 'plain reply' }),
      makeAssistantMessage(
        { createdAt: at(120) },
        {
          detectedArtwork: {
            title: 'Solo',
            artist: 'X',
            museum: 'M',
            room: 'R',
            confidence: 0.9,
          },
        },
      ),
    ];

    const summary = buildVisitSummary(messages, null);

    expect(summary.artworks.map((a) => a.title)).toEqual(['Solo']);
    expect(summary.museumName).toBe('M');
    expect(summary.messageCount).toBe(3);
  });
});
