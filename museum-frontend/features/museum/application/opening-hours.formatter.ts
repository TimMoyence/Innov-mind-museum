import type { OpeningDay, ParsedOpeningDay, ParsedOpeningHours } from '../infrastructure/museumApi';

/**
 * Display model returned by {@link formatOpeningHours}. The UI renders this
 * verbatim — all locale-aware formatting happens here via the injected `t()`.
 */
export interface OpeningHoursDisplay {
  /** One-line human summary, e.g. `"Open · Closes at 18:00"`. */
  label: string;
  /** Drives the accent color in the UI. */
  tone: 'positive' | 'neutral' | 'warning';
  /** Grouped weekly schedule — consecutive same-hour days collapsed. */
  weeklyLines: string[];
}

/** Translation keys consumed by the formatter — kept literal so i18next's TFunction accepts a structural match. */
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

/**
 * Minimal contract the formatter needs from i18next's `t()`. Kept narrow so
 * the formatter can be unit-tested without spinning up `react-i18next`.
 * Mirrors {@link formatDistance}'s `DistanceTFunction` pattern.
 */
export type I18nTranslator = (
  key: OpeningHoursI18nKey,
  options?: Record<string, string | number>,
) => string;

const DAY_ORDER: OpeningDay[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

const shortDayLabel = (t: I18nTranslator, day: OpeningDay): string => t(`days.${day}`);

const fullDayLabel = (t: I18nTranslator, day: OpeningDay): string => t(`days.on_${day}`);

/** Same-day-of-week signature used to collapse consecutive identical rows. */
const rowSignature = (row: ParsedOpeningDay): string =>
  row.opens === null || row.closes === null ? 'closed' : `${row.opens}|${row.closes}`;

/**
 * Collapses consecutive days sharing the same open/close window into a single
 * range line (e.g. `"Mon–Fri 10:00–18:00"`). Days with no hours render as
 * `"Sat Closed"`.
 */
const buildWeeklyLines = (weekly: ParsedOpeningDay[], t: I18nTranslator): string[] => {
  if (weekly.length === 0) return [];

  // Sort defensively — BE should already return Mon→Sun but we don't rely on it.
  const orderedRows: ParsedOpeningDay[] = DAY_ORDER.map((day) =>
    weekly.find((row) => row.day === day),
  ).filter((row): row is ParsedOpeningDay => row !== undefined);

  const lines: string[] = [];
  let groupStart = 0;

  for (let i = 1; i <= orderedRows.length; i += 1) {
    const prev = orderedRows[i - 1];
    if (!prev) continue;
    const current = i < orderedRows.length ? orderedRows[i] : null;
    const sameAsPrev = current !== null && current !== undefined && rowSignature(current) === rowSignature(prev);
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
      // Narrowed via `isClosed`: both opens/closes are non-null here.
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

/**
 * Returns the next day (wrapping Sun→Mon) for the "opens at …" message.
 * Used when the museum is currently closed but reopens tomorrow.
 */
const nextDay = (today: OpeningDay): OpeningDay => {
  const idx = DAY_ORDER.indexOf(today);
  return DAY_ORDER[(idx + 1) % DAY_ORDER.length] ?? 'mon';
};

const todayCode = (now: Date): OpeningDay => {
  // Date.getDay(): 0=Sun, 1=Mon … 6=Sat. Normalize to Mon-first.
  const raw = now.getDay();
  const monFirst: OpeningDay[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  return monFirst[raw] ?? 'mon';
};

/**
 * Finds the next day (starting tomorrow, wrapping) that has opening hours.
 * Returns null when the museum is closed every day.
 */
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

/**
 * Builds the Google-like display summary for an OSM opening_hours tag.
 *
 * @param parsed - Structured value returned by the BE. `null` when the BE had
 * no data for this museum; returns `null` to let the UI hide the section.
 * @param t - i18n translator (passed in to keep this function pure and
 * testable without spinning up `react-i18next`).
 * @param now - Injectable clock for deterministic tests. Defaults to `new Date()`.
 */
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

  // status === 'closed'
  const base = t('museumDirectory.enrichment.closed');
  if (parsed.opensAtLocal) {
    const label = `${base} · ${t('museumDirectory.enrichment.opens_at', { time: parsed.opensAtLocal })}`;
    return { label, tone: 'warning', weeklyLines };
  }

  // Closed today but opens another day — surface the next open day.
  const nextRow = findNextOpenDay(parsed.weekly, today);
  if (nextRow?.opens) {
    const dayLabel =
      nextRow.day === nextDay(today) ? t('days.tomorrow') : fullDayLabel(t, nextRow.day);
    const label = `${base} · ${t('museumDirectory.enrichment.opens_on', { day: dayLabel, time: nextRow.opens })}`;
    return { label, tone: 'warning', weeklyLines };
  }

  return { label: base, tone: 'warning', weeklyLines };
};
