/**
 * B1 — Visit notebook (carnet de visite) domain types and grouping helper.
 *
 * The carnet aggregates past chat sessions into a museum-by-date view. The
 * grouping is client-side from the `chatApi.listSessions` payload — no extra
 * BE call, no new endpoint (NFR1).
 *
 * Spec : `docs/chat-ux-refonte/specs/B1.md` §0.4, §1.1 R3-R6, §2.2.
 */

import type { SessionListItemDTO } from './contracts';

/** Maximum length of the fallback title derived from `preview.text` (R5). */
const PREVIEW_TITLE_MAX_LENGTH = 90;

/** i18n key returned when no displayable title can be derived (R5). */
const UNTITLED_SESSION_KEY = 'carnet.untitledSession';

/**
 * View-model for a single session row in the carnet list.
 *
 * Built by {@link groupSessionsByMuseumAndDate} from the BE list payload.
 * Field-by-field invariants are documented in spec §1.1 R5-R6.
 */
export interface VisitCarnetCard {
  /** Session id — primary key, also used for navigation to the detail screen. */
  id: string;
  /**
   * Display title. Precedence (R5) : `session.title` → `lastArtworkTitle` →
   * truncated `preview.text` → i18n key `carnet.untitledSession`.
   */
  title: string;
  /** Human-readable museum label (museumName or i18n key for unknown). */
  museumLabel: string;
  /** Stable group key — `museumId:N` or `museumName:<slug>` or `unknown` (R3). */
  museumKey: string;
  /** Locale-formatted date label (R6). */
  dateLabel: string;
  /** Raw ISO timestamp preserved for downstream sorting and detail navigation. */
  rawUpdatedAt: string;
  /** Number of messages in the session (already filtered to > 0 by the hook). */
  messageCount: number;
  /** Last detected artwork title, if any. */
  lastArtworkTitle: string | null;
}

/**
 * Group of sessions sharing the same museum identity.
 *
 * Inner sessions are sorted by `rawUpdatedAt` DESC (R4). Groups themselves are
 * sorted by max(`rawUpdatedAt`) of their sessions DESC (R4) — that ordering
 * is preserved as-is by callers.
 */
export interface VisitCarnetGroup {
  museumKey: string;
  museumLabel: string;
  sessions: VisitCarnetCard[];
}

/**
 * Derives the stable group key for a session (R3 precedence).
 *
 * `museumId` wins when defined (numeric id is the most stable identifier).
 * Otherwise falls back to a slug derived from `museumName` (case-insensitive
 * trim, so `' Louvre '` and `'LOUVRE'` collapse into a single bucket). When
 * both are missing the literal key `'unknown'` is used.
 */
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

/**
 * Derives the human-readable label for a group. Uses the first non-empty
 * `museumName` we encounter for that key (within-group `museumName` may
 * differ across sessions due to legacy data, but stays semantically the
 * same museum). When all sessions have null `museumName` we return an i18n
 * KEY that the screen translates — keeps this function pure.
 */
function deriveMuseumLabel(museumName: string | null | undefined): string {
  if (typeof museumName === 'string' && museumName.trim().length > 0) {
    return museumName.trim();
  }
  return 'carnet.unknownMuseum';
}

/**
 * Derives the displayable title from a session payload (R5).
 *
 * The pure function returns an i18n KEY (`carnet.untitledSession`) when no
 * display text is available — translation happens at the screen layer so
 * this helper stays locale-agnostic and deterministic (AC13).
 */
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

/**
 * Formats `updatedAt` to a locale-aware date label (R6).
 *
 * Uses `Date.toLocaleString` with `{ day, month, year }` — no third-party
 * date library (NFR2). Tolerant of `Intl` runtime variations : if the
 * format throws or the timestamp is invalid, returns the raw ISO string
 * so the carnet still renders.
 */
function formatDateLabel(isoTimestamp: string, locale: string): string {
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) return isoTimestamp;
  try {
    return date.toLocaleString(locale, { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return date.toISOString();
  }
}

/**
 * Pure grouping helper used by the `useVisitCarnet` hook AND tested in
 * isolation (`__tests__/features/chat/carnet-grouping.test.ts`).
 *
 * Contract (B1 §1.1 R3-R6, §4 AC1, AC3, AC13) :
 *  - Group key precedence : `museumId` > `museumName` (case-insensitive
 *    trim) > `'unknown'`.
 *  - Sessions within a group are sorted by `updatedAt` DESC.
 *  - Groups are sorted by their max `updatedAt` DESC.
 *  - Title precedence : `title` → `lastArtworkTitle` → truncated
 *    `preview.text` → i18n key `carnet.untitledSession`.
 *  - Date label : `toLocaleString(locale, { day, month, year })`.
 *  - Deterministic and side-effect-free.
 *
 * Filtering (e.g. `messageCount === 0`) is the caller's responsibility
 * — this function operates on whatever array it receives.
 */
export function groupSessionsByMuseumAndDate(
  sessions: SessionListItemDTO[],
  locale: string,
): VisitCarnetGroup[] {
  // Bucket sessions by stable key while preserving the first museum-label
  // we observe for that key.
  const buckets = new Map<string, { museumLabel: string; sessions: VisitCarnetCard[] }>();

  for (const session of sessions) {
    const museumKey = deriveMuseumKey(session.museumId, session.museumName);
    const museumLabel = deriveMuseumLabel(session.museumName);
    const card: VisitCarnetCard = {
      id: session.id,
      title: deriveCardTitle(session),
      museumLabel,
      museumKey,
      dateLabel: formatDateLabel(session.updatedAt, locale),
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

  // Sort sessions within each group DESC by updatedAt, then sort groups DESC
  // by their max updatedAt.
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
