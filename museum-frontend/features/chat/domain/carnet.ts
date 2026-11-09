import { formatAppDate } from '../../../shared/lib/formatDate';

import type { SessionListItemDTO } from './contracts';

const PREVIEW_TITLE_MAX_LENGTH = 90;

const UNTITLED_SESSION_KEY = 'carnet.untitledSession';

export interface VisitCarnetCard {
  id: string;
  title: string;
  museumLabel: string;
  museumKey: string;
  dateLabel: string | null;
  rawUpdatedAt: string;
  messageCount: number;
  lastArtworkTitle: string | null;
}

export interface VisitCarnetGroup {
  museumKey: string;
  museumLabel: string;
  sessions: VisitCarnetCard[];
}

function deriveMuseumKey(
  museumId: number | null | undefined,
  museumName: string | null | undefined,
): string {
  if (typeof museumId === 'number') return `museumId:${String(museumId)}`;
  if (typeof museumName === 'string') {
    const slug = museumName.trim().toLowerCase();
    if (slug.length > 0) return `museumName:${slug}`;
  }
  return 'unknown';
}

function deriveMuseumLabel(museumName: string | null | undefined): string {
  if (typeof museumName === 'string' && museumName.trim().length > 0) {
    return museumName.trim();
  }
  return 'carnet.unknownMuseum';
}

function deriveCardTitle(session: SessionListItemDTO): string {
  if (typeof session.title === 'string' && session.title.length > 0) {
    return session.title;
  }
  if (typeof session.lastArtworkTitle === 'string' && session.lastArtworkTitle.length > 0) {
    return session.lastArtworkTitle;
  }
  const previewText = session.preview?.text;
  if (typeof previewText === 'string' && previewText.length > 0) {
    return previewText.length > PREVIEW_TITLE_MAX_LENGTH
      ? previewText.slice(0, PREVIEW_TITLE_MAX_LENGTH)
      : previewText;
  }
  return UNTITLED_SESSION_KEY;
}

export const formatCarnetDate = (isoTimestamp: string, locale: string): string | null =>
  formatAppDate(isoTimestamp, locale, { day: '2-digit', month: 'short', year: 'numeric' });

export function groupSessionsByMuseumAndDate(
  sessions: SessionListItemDTO[],
  locale: string,
): VisitCarnetGroup[] {
  const buckets = new Map<string, { museumLabel: string; sessions: VisitCarnetCard[] }>();

  for (const session of sessions) {
    const museumKey = deriveMuseumKey(session.museumId, session.museumName);
    const museumLabel = deriveMuseumLabel(session.museumName);
    const card: VisitCarnetCard = {
      id: session.id,
      title: deriveCardTitle(session),
      museumLabel,
      museumKey,
      dateLabel: formatCarnetDate(session.updatedAt, locale),
      rawUpdatedAt: session.updatedAt,
      messageCount: session.messageCount,
      lastArtworkTitle: session.lastArtworkTitle ?? null,
    };

    const existing = buckets.get(museumKey);
    if (existing) {
      existing.sessions.push(card);
    } else {
      buckets.set(museumKey, { museumLabel, sessions: [card] });
    }
  }

  const groups: VisitCarnetGroup[] = [];
  for (const [museumKey, { museumLabel, sessions: cards }] of buckets.entries()) {
    const sorted = [...cards].sort(
      (left, right) =>
        new Date(right.rawUpdatedAt).getTime() - new Date(left.rawUpdatedAt).getTime(),
    );
    groups.push({ museumKey, museumLabel, sessions: sorted });
  }

  groups.sort((left, right) => {
    const leftMax = left.sessions[0]?.rawUpdatedAt ?? '';
    const rightMax = right.sessions[0]?.rawUpdatedAt ?? '';
    return new Date(rightMax).getTime() - new Date(leftMax).getTime();
  });

  return groups;
}
