/**
 * Lightweight OSM `opening_hours` parser — covers ~90% subset on French
 * museums (day ranges, multi-range days, `24/7`, `off`) without pulling in
 * the 3.9 MB `opening_hours` npm package.
 *
 * Grammar supported:
 *   - `Mo-Fr 10:00-18:00; Sa-Su 10:00-19:00`
 *   - `Mo-Su 10:00-18:00`
 *   - `Tu-Su 10:00-18:00; Mo off`
 *   - `24/7`
 *   - `Mo-Fr 10:00-12:00, 14:00-18:00` (split midday — keeps LAST range as primary)
 *
 * Outside this grammar → `status: 'unknown'` / `statusReason: 'unparseable'`,
 * raw value preserved.
 */

import type {
  OpeningDay,
  ParsedOpeningDay,
  ParsedOpeningHours,
} from '@modules/museum/domain/enrichment/enrichment.types';

const WEEK: OpeningDay[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

const DAY_TOKENS: Partial<Record<string, OpeningDay>> = {
  Mo: 'mon',
  Tu: 'tue',
  We: 'wed',
  Th: 'thu',
  Fr: 'fri',
  Sa: 'sat',
  Su: 'sun',
};

const DAY_INDEX: Record<OpeningDay, number> = {
  mon: 0,
  tue: 1,
  wed: 2,
  thu: 3,
  fri: 4,
  sat: 5,
  sun: 6,
};

/** JS `Date.getDay()` (Sun=0..Sat=6) → Mon-first index. */
const jsDayToIndex = (d: number): number => (d + 6) % 7;

const unparseable = (raw: string, reason: 'unparseable' | 'no_data'): ParsedOpeningHours => ({
  raw,
  status: 'unknown',
  statusReason: reason,
  closesAtLocal: null,
  opensAtLocal: null,
  weekly: WEEK.map<ParsedOpeningDay>((day) => ({ day, opens: null, closes: null })),
});

const allOpen = (raw: string): ParsedOpeningHours => ({
  raw,
  status: 'open',
  statusReason: 'currently_open',
  closesAtLocal: '23:59',
  opensAtLocal: '00:00',
  weekly: WEEK.map<ParsedOpeningDay>((day) => ({ day, opens: '00:00', closes: '23:59' })),
});

function expandDayFragment(fragment: string): number[] | null {
  if (fragment.includes('-')) {
    return expandDayRange(fragment);
  }
  const day = DAY_TOKENS[fragment];
  if (!day) return null;
  return [DAY_INDEX[day]];
}

/** Supports wrap-around (e.g. "Fr-Mo"). */
function expandDayRange(range: string): number[] | null {
  const [from, to] = range.split('-').map((s) => s.trim());
  const fromDay = DAY_TOKENS[from];
  const toDay = DAY_TOKENS[to];
  if (!fromDay || !toDay) return null;
  const fromIdx = DAY_INDEX[fromDay];
  const toIdx = DAY_INDEX[toDay];
  const result: number[] = [];
  if (fromIdx <= toIdx) {
    for (let i = fromIdx; i <= toIdx; i += 1) result.push(i);
  } else {
    for (let i = fromIdx; i < 7; i += 1) result.push(i);
    for (let i = 0; i <= toIdx; i += 1) result.push(i);
  }
  return result;
}

/** Returns null on any unknown token (whole expression marked unparseable). */
function expandDaySpec(spec: string): number[] | null {
  const result: number[] = [];
  for (const part of spec.split(',').map((s) => s.trim())) {
    const expanded = expandDayFragment(part);
    if (!expanded) return null;
    result.push(...expanded);
  }
  return result;
}

const TIME_RANGE_REGEX = /^([0-2]\d:[0-5]\d)-([0-2]\d:[0-5]\d)$/;

/** Returns [opens, closes] of the **last** range in a comma list. */
function parseTimeRanges(rangesSpec: string): { opens: string; closes: string } | null {
  const parts = rangesSpec.split(',').map((s) => s.trim());
  const last = parts.at(-1);
  if (!last) return null;
  const match = TIME_RANGE_REGEX.exec(last);
  if (!match) return null;
  const [, opens, closes] = match;
  return { opens, closes };
}

/** Returns false if malformed. Mutates `weekly`. */
function applyClause(clause: string, weekly: (ParsedOpeningDay | null)[]): boolean {
  const trimmed = clause.trim();
  if (!trimmed) return true;

  // "Mo off" or "Mo-We off"
  // eslint-disable-next-line sonarjs/slow-regex -- bounded input (single clause, ~50 chars max from upstream tokeniser); `.+?` + `\s+` cannot cause catastrophic backtracking with the `off$` anchor and non-overlapping char classes
  const offMatch = /^(.+?)\s+off$/i.exec(trimmed);
  if (offMatch) {
    const days = expandDaySpec(offMatch[1].trim());
    if (!days) return false;
    for (const idx of days) {
      weekly[idx] = { day: WEEK[idx], opens: null, closes: null };
    }
    return true;
  }

  // "<daySpec> <HH:MM-HH:MM[, HH:MM-HH:MM]>"
  const firstSpace = trimmed.indexOf(' ');
  if (firstSpace === -1) return false;
  const daySpec = trimmed.slice(0, firstSpace).trim();
  const timeSpec = trimmed.slice(firstSpace + 1).trim();

  const days = expandDaySpec(daySpec);
  if (!days) return false;
  const times = parseTimeRanges(timeSpec);
  if (!times) return false;

  for (const idx of days) {
    weekly[idx] = { day: WEEK[idx], opens: times.opens, closes: times.closes };
  }
  return true;
}

/**
 * `HH:mm` strings are **in the museum's local time** — caller must normalise
 * `now` into that timezone if required. V1 compares naively against JS local
 * time of `now`; tz-aware upgrade tracked as known limitation.
 */
function computeStatus(
  weekly: ParsedOpeningDay[],
  now: Date,
): Pick<ParsedOpeningHours, 'status' | 'statusReason' | 'opensAtLocal' | 'closesAtLocal'> {
  const today = weekly[jsDayToIndex(now.getDay())];
  if (today.opens == null || today.closes == null) {
    return {
      status: 'closed',
      statusReason: 'currently_closed',
      opensAtLocal: null,
      closesAtLocal: null,
    };
  }

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const [openH, openM] = today.opens.split(':').map(Number);
  const [closeH, closeM] = today.closes.split(':').map(Number);
  const openMinutes = openH * 60 + openM;
  const closeMinutes = closeH * 60 + closeM;

  const isOpen = nowMinutes >= openMinutes && nowMinutes < closeMinutes;
  return {
    status: isOpen ? 'open' : 'closed',
    statusReason: isOpen ? 'currently_open' : 'currently_closed',
    opensAtLocal: today.opens,
    closesAtLocal: today.closes,
  };
}

/** Never throws — unknown input → `status: 'unknown'`. */
export function parseOpeningHours(raw: string, now: Date = new Date()): ParsedOpeningHours {
  const trimmed = raw.trim();
  if (!trimmed) return unparseable(raw, 'no_data');

  if (trimmed === '24/7') return allOpen(raw);

  const weekly: (ParsedOpeningDay | null)[] = WEEK.map((day) => ({
    day,
    opens: null,
    closes: null,
  }));

  const clauses = trimmed
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
  for (const clause of clauses) {
    if (!applyClause(clause, weekly)) {
      return unparseable(raw, 'unparseable');
    }
  }

  const concreteWeekly = weekly as ParsedOpeningDay[];
  const hasAnyOpenDay = concreteWeekly.some((d) => d.opens != null);
  if (!hasAnyOpenDay) return unparseable(raw, 'unparseable');

  const status = computeStatus(concreteWeekly, now);
  return {
    raw,
    ...status,
    weekly: concreteWeekly,
  };
}
