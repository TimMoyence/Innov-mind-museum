import { formatAppDate } from '../../../shared/lib/formatDate';

import type { SessionListItemDTO } from './contracts';

export interface DashboardSessionCard {
  id: string;
  title: string | null;
  subtitle: string | null;
  timeLabel: string | null;
  messageCount: number;
}

const truncate = (value: string, max = 90): string => {
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
};

export const mapSessionToDashboardCard = (
  session: SessionListItemDTO,
  locale = 'en-US',
): DashboardSessionCard => {
  const rawTitle = session.title ?? session.preview?.text?.trim() ?? null;

  return {
    id: session.id,
    title: rawTitle ? truncate(rawTitle) : null,
    subtitle:
      session.museumName && session.museumName !== session.title ? session.museumName : null,
    timeLabel: formatAppDate(session.preview?.createdAt ?? session.updatedAt, locale, {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }),
    messageCount: session.messageCount,
  };
};

export const mapSessionsToDashboardCards = (
  sessions: SessionListItemDTO[],
  locale = 'en-US',
): DashboardSessionCard[] => {
  return sessions.map((session) => mapSessionToDashboardCard(session, locale));
};
