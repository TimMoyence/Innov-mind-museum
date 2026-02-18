import { SessionListItemDTO } from './contracts';

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

export const mapSessionToDashboardCard = (
  session: SessionListItemDTO,
  locale = 'en-US',
): DashboardSessionCard => {
  const rawTitle = session.preview?.text?.trim() || fallbackTitle;
  const modeLabel = session.museumMode ? 'Guided mode' : 'Standard mode';
  const subtitle = session.locale
    ? `${modeLabel} • ${session.locale}`
    : modeLabel;
  const timeSource = session.preview?.createdAt || session.updatedAt;

  return {
    id: session.id,
    title: truncate(rawTitle),
    subtitle,
    timeLabel: formatSessionTime(timeSource, locale),
    messageCount: session.messageCount,
  };
};

export const mapSessionsToDashboardCards = (
  sessions: SessionListItemDTO[],
  locale = 'en-US',
): DashboardSessionCard[] => {
  return sessions.map((session) => mapSessionToDashboardCard(session, locale));
};
