/**
 * Unit tests for {@link formatOpeningHours}. Pure function — no mocks other
 * than a synthetic `t()` translator + an injected clock. Every assertion
 * pins a locale-independent contract so UI regressions surface fast.
 */
import {
  formatOpeningHours,
  type I18nTranslator,
} from '@/features/museum/application/opening-hours.formatter';
import type {
  OpeningDay,
  ParsedOpeningDay,
  ParsedOpeningHours,
} from '@/features/museum/infrastructure/museumApi';

// ── Translator factory ───────────────────────────────────────────────────────

const DAYS_SHORT: Record<OpeningDay, string> = {
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
  sun: 'Sun',
};

const DAYS_FULL: Record<OpeningDay, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
};

/**
 * Minimal translator that matches the structural keys the formatter emits.
 * Mirrors the behavior of i18next's default interpolation so assertions read
 * like the real UI output.
 */
const makeTranslator = (): I18nTranslator => (key, options) => {
  switch (key) {
    case 'museumDirectory.enrichment.open':
      return 'Open';
    case 'museumDirectory.enrichment.closed':
      return 'Closed';
    case 'museumDirectory.enrichment.closes_at':
      return `Closes at ${String(options?.time ?? '')}`;
    case 'museumDirectory.enrichment.opens_at':
      return `Opens at ${String(options?.time ?? '')}`;
    case 'museumDirectory.enrichment.opens_on':
      return `Opens ${String(options?.day ?? '')} at ${String(options?.time ?? '')}`;
    case 'museumDirectory.enrichment.weekly_closed':
      return `${String(options?.day ?? '')} Closed`;
    case 'museumDirectory.enrichment.weekly_single':
      return `${String(options?.day ?? '')} ${String(options?.opens ?? '')}-${String(
        options?.closes ?? '',
      )}`;
    case 'museumDirectory.enrichment.weekly_range':
      return `${String(options?.start ?? '')}-${String(options?.end ?? '')} ${String(
        options?.opens ?? '',
      )}-${String(options?.closes ?? '')}`;
    case 'days.tomorrow':
      return 'tomorrow';
    default:
      break;
  }
  // Pattern `days.<day>` or `days.on_<day>`.
  const dayMatch = /^days\.(on_)?(mon|tue|wed|thu|fri|sat|sun)$/.exec(key);
  if (dayMatch) {
    const [, onPrefix, day] = dayMatch;
    const d = day as OpeningDay;
    return onPrefix ? DAYS_FULL[d] : DAYS_SHORT[d];
  }
  return key;
};

// ── Fixture helpers ──────────────────────────────────────────────────────────

const makeDay = (
  day: OpeningDay,
  opens: string | null,
  closes: string | null,
): ParsedOpeningDay => ({ day, opens, closes });

/** Full weekly schedule where Mon-Fri share hours, Sat/Sun closed. */
const weeklyMonFriOpen: ParsedOpeningDay[] = [
  makeDay('mon', '10:00', '18:00'),
  makeDay('tue', '10:00', '18:00'),
  makeDay('wed', '10:00', '18:00'),
  makeDay('thu', '10:00', '18:00'),
  makeDay('fri', '10:00', '18:00'),
  makeDay('sat', null, null),
  makeDay('sun', null, null),
];

const makeParsed = (overrides?: Partial<ParsedOpeningHours>): ParsedOpeningHours => ({
  raw: 'Mo-Fr 10:00-18:00',
  status: 'open',
  statusReason: 'currently_open',
  closesAtLocal: '18:00',
  opensAtLocal: null,
  weekly: weeklyMonFriOpen,
  ...overrides,
});

// A Wednesday at noon UTC — deterministic clock for the `now` tests.
const WED_NOON = new Date('2026-04-22T12:00:00Z');

// ── Tests ────────────────────────────────────────────────────────────────────

describe('formatOpeningHours', () => {
  const t = makeTranslator();

  describe('null + unknown guards', () => {
    it('returns null when parsed is null', () => {
      expect(formatOpeningHours(null, t, WED_NOON)).toBeNull();
    });

    it("returns null when status is 'unknown'", () => {
      const parsed = makeParsed({ status: 'unknown', statusReason: 'unparseable' });
      expect(formatOpeningHours(parsed, t, WED_NOON)).toBeNull();
    });
  });

  describe('labels', () => {
    it("labels 'Open · Closes at 18:00' when open with closesAtLocal", () => {
      const result = formatOpeningHours(makeParsed(), t, WED_NOON);
      expect(result?.label).toBe('Open · Closes at 18:00');
    });

    it('omits the "Closes at" suffix when closesAtLocal is null', () => {
      const parsed = makeParsed({ closesAtLocal: null });
      const result = formatOpeningHours(parsed, t, WED_NOON);
      expect(result?.label).toBe('Open');
    });

    it("labels 'Closed · Opens at 10:00' when closed with opensAtLocal", () => {
      const parsed = makeParsed({
        status: 'closed',
        statusReason: 'currently_closed',
        closesAtLocal: null,
        opensAtLocal: '10:00',
      });
      const result = formatOpeningHours(parsed, t, WED_NOON);
      expect(result?.label).toBe('Closed · Opens at 10:00');
    });
  });

  describe('tone', () => {
    it('tone: positive when open', () => {
      const result = formatOpeningHours(makeParsed(), t, WED_NOON);
      expect(result?.tone).toBe('positive');
    });

    it('tone: warning when closed', () => {
      const parsed = makeParsed({
        status: 'closed',
        statusReason: 'currently_closed',
        opensAtLocal: '10:00',
        closesAtLocal: null,
      });
      const result = formatOpeningHours(parsed, t, WED_NOON);
      expect(result?.tone).toBe('warning');
    });

    it('tone: warning when closed with no next-open info (neutral only reachable via unknown which returns null)', () => {
      // With weekly all closed, closed+no opensAtLocal → warning + base label.
      const parsed: ParsedOpeningHours = {
        raw: 'closed',
        status: 'closed',
        statusReason: 'currently_closed',
        closesAtLocal: null,
        opensAtLocal: null,
        weekly: [
          makeDay('mon', null, null),
          makeDay('tue', null, null),
          makeDay('wed', null, null),
          makeDay('thu', null, null),
          makeDay('fri', null, null),
          makeDay('sat', null, null),
          makeDay('sun', null, null),
        ],
      };
      const result = formatOpeningHours(parsed, t, WED_NOON);
      expect(result?.tone).toBe('warning');
      expect(result?.label).toBe('Closed');
    });
  });

  describe('weeklyLines', () => {
    it('collapses consecutive same-hours days into a range (Mon-Fri 10:00-18:00)', () => {
      const result = formatOpeningHours(makeParsed(), t, WED_NOON);
      expect(result?.weeklyLines[0]).toBe('Mon-Fri 10:00-18:00');
    });

    it('renders closed days as a dedicated closed line', () => {
      const result = formatOpeningHours(makeParsed(), t, WED_NOON);
      // Second line covers Sat–Sun (both closed, consecutive). Formatter uses
      // en-dash (U+2013) for closed-day ranges — pin it here to catch regressions.
      expect(result?.weeklyLines[1]).toBe('Sat–Sun Closed');
    });

    it('separates groups when hours differ', () => {
      const weekly: ParsedOpeningDay[] = [
        makeDay('mon', '09:00', '17:00'),
        makeDay('tue', '09:00', '17:00'),
        makeDay('wed', '10:00', '18:00'),
        makeDay('thu', '10:00', '18:00'),
        makeDay('fri', '10:00', '18:00'),
        makeDay('sat', null, null),
        makeDay('sun', null, null),
      ];
      const parsed = makeParsed({ weekly });
      const result = formatOpeningHours(parsed, t, WED_NOON);
      expect(result?.weeklyLines).toEqual([
        'Mon-Tue 09:00-17:00',
        'Wed-Fri 10:00-18:00',
        'Sat–Sun Closed',
      ]);
    });

    it('emits a single-day line (not a range) for an isolated day', () => {
      const weekly: ParsedOpeningDay[] = [
        makeDay('mon', '10:00', '18:00'),
        makeDay('tue', null, null),
        makeDay('wed', '10:00', '18:00'),
        makeDay('thu', '10:00', '18:00'),
        makeDay('fri', '10:00', '18:00'),
        makeDay('sat', null, null),
        makeDay('sun', null, null),
      ];
      const parsed = makeParsed({ weekly });
      const result = formatOpeningHours(parsed, t, WED_NOON);
      // Mon is isolated → single_single line, not a range.
      expect(result?.weeklyLines[0]).toBe('Mon 10:00-18:00');
      expect(result?.weeklyLines[1]).toBe('Tue Closed');
    });

    it('returns an empty weeklyLines array when weekly schedule is empty', () => {
      const parsed = makeParsed({ weekly: [] });
      const result = formatOpeningHours(parsed, t, WED_NOON);
      expect(result?.weeklyLines).toEqual([]);
    });

    it('passes localized day names via the translator (uses `days.<code>` keys)', () => {
      const seenKeys: string[] = [];
      const spyingTranslator: I18nTranslator = (key, options) => {
        seenKeys.push(key);
        return t(key, options);
      };
      formatOpeningHours(makeParsed(), spyingTranslator, WED_NOON);
      // Short labels used for weekly lines.
      expect(seenKeys).toEqual(
        expect.arrayContaining(['days.mon', 'days.fri', 'days.sat', 'days.sun']),
      );
    });
  });

  describe('next-open day fallback (closed today)', () => {
    it("emits 'Closed · Opens tomorrow at 10:00' when tomorrow is the next open day", () => {
      // Today = Wednesday. Closed Wed, opens Thu.
      const weekly: ParsedOpeningDay[] = [
        makeDay('mon', '10:00', '18:00'),
        makeDay('tue', '10:00', '18:00'),
        makeDay('wed', null, null),
        makeDay('thu', '10:00', '18:00'),
        makeDay('fri', '10:00', '18:00'),
        makeDay('sat', null, null),
        makeDay('sun', null, null),
      ];
      const parsed = makeParsed({
        status: 'closed',
        statusReason: 'currently_closed',
        closesAtLocal: null,
        opensAtLocal: null,
        weekly,
      });
      const result = formatOpeningHours(parsed, t, WED_NOON);
      expect(result?.label).toBe('Closed · Opens tomorrow at 10:00');
      expect(result?.tone).toBe('warning');
    });

    it('names the day explicitly when the next open day is not tomorrow', () => {
      // Today = Saturday. Closed Sat+Sun, opens Mon.
      const SAT_NOON = new Date('2026-04-25T12:00:00Z');
      const parsed = makeParsed({
        status: 'closed',
        statusReason: 'currently_closed',
        closesAtLocal: null,
        opensAtLocal: null,
      });
      const result = formatOpeningHours(parsed, t, SAT_NOON);
      expect(result?.label).toBe('Closed · Opens Monday at 10:00');
    });
  });
});
