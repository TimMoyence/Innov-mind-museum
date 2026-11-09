import type { OpeningDay, ParsedOpeningDay, ParsedOpeningHours } from '../infrastructure/museumApi';

export interface OpeningHoursDisplay {
  label: string;
  tone: 'positive' | 'neutral' | 'warning';
  weeklyLines: string[];
}

type OpeningHoursI18nKey =
  | 'museumDirectory.enrichment.open'
  | 'museumDirectory.enrichment.closed'
  | 'museumDirectory.enrichment.closes_at'
  | 'museumDirectory.enrichment.opens_at'
  | 'museumDirectory.enrichment.opens_on'
  | 'museumDirectory.enrichment.weekly_closed'
  | 'museumDirectory.enrichment.weekly_single'
  | 'museumDirectory.enrichment.weekly_range'
  | 'days.tomorrow'
  | `days.${OpeningDay}`
  | `days.on_${OpeningDay}`;

export type I18nTranslator = (
  key: OpeningHoursI18nKey,
  options?: Record<string, string | number>,
) => string;

const DAY_ORDER: OpeningDay[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

const shortDayLabel = (t: I18nTranslator, day: OpeningDay): string => t(`days.${day}`);

const fullDayLabel = (t: I18nTranslator, day: OpeningDay): string => t(`days.on_${day}`);

const rowSignature = (row: ParsedOpeningDay): string =>
  row.opens === null || row.closes === null ? 'closed' : `${row.opens}|${row.closes}`;

const buildWeeklyLines = (weekly: ParsedOpeningDay[], t: I18nTranslator): string[] => {
  if (weekly.length === 0) return [];

  const orderedRows: ParsedOpeningDay[] = DAY_ORDER.map((day) =>
    weekly.find((row) => row.day === day),
  ).filter((row): row is ParsedOpeningDay => row !== undefined);

  const lines: string[] = [];
  let groupStart = 0;

  for (let i = 1; i <= orderedRows.length; i += 1) {
    const prev = orderedRows[i - 1];
    if (!prev) continue;
    const current = i < orderedRows.length ? orderedRows[i] : null;
    const sameAsPrev =
      current !== null && current !== undefined && rowSignature(current) === rowSignature(prev);
    if (sameAsPrev) continue;

    const startRow = orderedRows[groupStart];
    const endRow = prev;
    if (!startRow) {
      groupStart = i;
      continue;
    }
    const isClosed = startRow.opens === null || startRow.closes === null;

    if (isClosed) {
      const dayLabel =
        groupStart === i - 1
          ? shortDayLabel(t, startRow.day)
          : `${shortDayLabel(t, startRow.day)}–${shortDayLabel(t, endRow.day)}`;
      lines.push(t('museumDirectory.enrichment.weekly_closed', { day: dayLabel }));
    } else {
      const opens = startRow.opens ?? '';
      const closes = startRow.closes ?? '';
      if (groupStart === i - 1) {
        lines.push(
          t('museumDirectory.enrichment.weekly_single', {
            day: shortDayLabel(t, startRow.day),
            opens,
            closes,
          }),
        );
      } else {
        lines.push(
          t('museumDirectory.enrichment.weekly_range', {
            start: shortDayLabel(t, startRow.day),
            end: shortDayLabel(t, endRow.day),
            opens,
            closes,
          }),
        );
      }
    }
    groupStart = i;
  }

  return lines;
};

const nextDay = (today: OpeningDay): OpeningDay => {
  const idx = DAY_ORDER.indexOf(today);
  return DAY_ORDER[(idx + 1) % DAY_ORDER.length] ?? 'mon';
};

const todayCode = (now: Date): OpeningDay => {
  const raw = now.getDay();
  const monFirst: OpeningDay[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  return monFirst[raw] ?? 'mon';
};

const findNextOpenDay = (
  weekly: ParsedOpeningDay[],
  today: OpeningDay,
): ParsedOpeningDay | null => {
  const startIdx = DAY_ORDER.indexOf(today);
  for (let offset = 1; offset <= DAY_ORDER.length; offset += 1) {
    const candidate = DAY_ORDER[(startIdx + offset) % DAY_ORDER.length];
    const row = weekly.find((r) => r.day === candidate);
    if (row?.opens !== null && row !== undefined) return row;
  }
  return null;
};

export const formatOpeningHours = (
  parsed: ParsedOpeningHours | null,
  t: I18nTranslator,
  now: Date = new Date(),
): OpeningHoursDisplay | null => {
  if (!parsed || parsed.status === 'unknown') return null;

  const weeklyLines = buildWeeklyLines(parsed.weekly, t);
  const today = todayCode(now);

  if (parsed.status === 'open') {
    const base = t('museumDirectory.enrichment.open');
    const label = parsed.closesAtLocal
      ? `${base} · ${t('museumDirectory.enrichment.closes_at', { time: parsed.closesAtLocal })}`
      : base;
    return { label, tone: 'positive', weeklyLines };
  }

  const base = t('museumDirectory.enrichment.closed');
  if (parsed.opensAtLocal) {
    const label = `${base} · ${t('museumDirectory.enrichment.opens_at', { time: parsed.opensAtLocal })}`;
    return { label, tone: 'warning', weeklyLines };
  }

  const nextRow = findNextOpenDay(parsed.weekly, today);
  if (nextRow?.opens) {
    const dayLabel =
      nextRow.day === nextDay(today) ? t('days.tomorrow') : fullDayLabel(t, nextRow.day);
    const label = `${base} · ${t('museumDirectory.enrichment.opens_on', { day: dayLabel, time: nextRow.opens })}`;
    return { label, tone: 'warning', weeklyLines };
  }

  return { label: base, tone: 'warning', weeklyLines };
};
