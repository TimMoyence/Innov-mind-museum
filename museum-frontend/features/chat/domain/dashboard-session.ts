import type { SessionListItemDTO } from './contracts';

/** View-model for a session card displayed on the conversation dashboard. */
export interface DashboardSessionCard {
  id: string;
  title: string;
  subtitle: string;
  timeLabel: string;
  messageCount: number;
}

const fallbackTitle = 'No messages yet';

const formatSessionTime = (iso: string, locale: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return 'Unknown time';
  }

  return date.toLocaleString(locale || undefined, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const truncate = (value: string, max = 90): string => {
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
};

/**
 * Maps a single session list DTO to a dashboard card view-model.
 * @param session - Raw session item from the API.
 * @param locale - BCP-47 locale used for time formatting (defaults to `'en-US'`).
 * @returns A {@link DashboardSessionCard} ready for UI rendering.
 */
export const mapSessionToDashboardCard = (
  session: SessionListItemDTO,
  locale = 'en-US',
): DashboardSessionCard => {
  const rawTitle = session.title ?? session.preview?.text?.trim() ?? fallbackTitle;
  const modeLabel = session.museumMode ? 'Guided mode' : 'Standard mode';
  // Skip museumName from subtitle when it's already the title (prevents duplication)
  const showMuseumInSubtitle = session.museumName && session.museumName !== session.title;
  const parts = [
    modeLabel,
    showMuseumInSubtitle ? session.museumName : null,
    session.locale,
  ].filter(Boolean);
  const subtitle = parts.join(' • ');
  const timeSource = session.preview?.createdAt ?? session.updatedAt;

  return {
    id: session.id,
    title: truncate(rawTitle),
    subtitle,
    timeLabel: formatSessionTime(timeSource, locale),
    messageCount: session.messageCount,
  };
};

/**
 * Maps an array of session list DTOs to dashboard card view-models.
 * @param sessions - Raw session items from the API.
 * @param locale - BCP-47 locale used for time formatting (defaults to `'en-US'`).
 * @returns An array of {@link DashboardSessionCard} objects.
 */
export const mapSessionsToDashboardCards = (
  sessions: SessionListItemDTO[],
  locale = 'en-US',
): DashboardSessionCard[] => {
  return sessions.map((session) => mapSessionToDashboardCard(session, locale));
};
