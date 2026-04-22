import { parseOpeningHours } from '@modules/museum/adapters/secondary/opening-hours-parser';

describe('parseOpeningHours', () => {
  const wednesdayNoon = new Date('2026-04-22T12:00:00Z'); // Wed — server local TZ assumed

  it('parses simple single-range Mo-Fr', () => {
    const result = parseOpeningHours('Mo-Fr 10:00-18:00', wednesdayNoon);
    expect(result.weekly.find((d) => d.day === 'wed')).toEqual({
      day: 'wed',
      opens: '10:00',
      closes: '18:00',
    });
    expect(result.weekly.find((d) => d.day === 'sat')).toEqual({
      day: 'sat',
      opens: null,
      closes: null,
    });
    expect(result.statusReason).toBe('currently_open');
    expect(result.opensAtLocal).toBe('10:00');
    expect(result.closesAtLocal).toBe('18:00');
  });

  it('parses two-clause Mo-Fr + Sa-Su', () => {
    const result = parseOpeningHours('Mo-Fr 10:00-18:00; Sa-Su 10:00-19:00', wednesdayNoon);
    expect(result.weekly.filter((d) => d.opens !== null)).toHaveLength(7);
    expect(result.weekly.find((d) => d.day === 'sun')?.closes).toBe('19:00');
  });

  it('parses full week Mo-Su', () => {
    const result = parseOpeningHours('Mo-Su 10:00-18:00', wednesdayNoon);
    expect(result.weekly.every((d) => d.opens === '10:00' && d.closes === '18:00')).toBe(true);
  });

  it('respects `Mo off`', () => {
    const result = parseOpeningHours('Tu-Su 10:00-18:00; Mo off', wednesdayNoon);
    expect(result.weekly.find((d) => d.day === 'mon')).toEqual({
      day: 'mon',
      opens: null,
      closes: null,
    });
    expect(result.weekly.find((d) => d.day === 'tue')?.opens).toBe('10:00');
  });

  it('handles 24/7 as always open', () => {
    const result = parseOpeningHours('24/7', wednesdayNoon);
    expect(result.status).toBe('open');
    expect(result.opensAtLocal).toBe('00:00');
    expect(result.closesAtLocal).toBe('23:59');
  });

  it('keeps last range when a day has split midday hours', () => {
    const result = parseOpeningHours('Mo-Fr 10:00-12:00, 14:00-18:00', wednesdayNoon);
    const wed = result.weekly.find((d) => d.day === 'wed');
    expect(wed).toEqual({ day: 'wed', opens: '14:00', closes: '18:00' });
  });

  it('returns unparseable on unknown day token', () => {
    const result = parseOpeningHours('Xx-Yy 10:00-18:00');
    expect(result.status).toBe('unknown');
    expect(result.statusReason).toBe('unparseable');
    expect(result.raw).toBe('Xx-Yy 10:00-18:00');
  });

  it('returns unparseable on malformed time', () => {
    const result = parseOpeningHours('Mo-Fr 10-18');
    expect(result.statusReason).toBe('unparseable');
  });

  it('returns no_data on empty input', () => {
    const result = parseOpeningHours('   ');
    expect(result.statusReason).toBe('no_data');
  });

  it('computes currently_closed before opening time', () => {
    const before = new Date('2026-04-22T07:00:00Z'); // Wed 07:00
    const result = parseOpeningHours('Mo-Fr 10:00-18:00', before);
    expect(result.statusReason).toBe('currently_closed');
  });

  it('computes currently_closed on closed day', () => {
    const sunday = new Date('2026-04-19T12:00:00Z');
    const result = parseOpeningHours('Mo-Fr 10:00-18:00', sunday);
    expect(result.statusReason).toBe('currently_closed');
    expect(result.opensAtLocal).toBeNull();
  });

  it('supports comma-separated day list Mo,We,Fr', () => {
    const result = parseOpeningHours('Mo,We,Fr 10:00-18:00', wednesdayNoon);
    expect(result.weekly.find((d) => d.day === 'mon')?.opens).toBe('10:00');
    expect(result.weekly.find((d) => d.day === 'tue')?.opens).toBeNull();
    expect(result.weekly.find((d) => d.day === 'wed')?.opens).toBe('10:00');
  });

  it('supports wrap-around day range Fr-Mo', () => {
    const result = parseOpeningHours('Fr-Mo 10:00-18:00', wednesdayNoon);
    expect(result.weekly.find((d) => d.day === 'fri')?.opens).toBe('10:00');
    expect(result.weekly.find((d) => d.day === 'sat')?.opens).toBe('10:00');
    expect(result.weekly.find((d) => d.day === 'sun')?.opens).toBe('10:00');
    expect(result.weekly.find((d) => d.day === 'mon')?.opens).toBe('10:00');
    expect(result.weekly.find((d) => d.day === 'tue')?.opens).toBeNull();
  });

  it('preserves raw on any outcome', () => {
    const raw = 'Mo-Fr 10:00-18:00; Sa 10:00-12:00';
    expect(parseOpeningHours(raw).raw).toBe(raw);
    expect(parseOpeningHours('invalid').raw).toBe('invalid');
  });

  it('flags currently_open at exactly opening time', () => {
    const atOpening = new Date('2026-04-22T10:00:00Z');
    const result = parseOpeningHours('Mo-Fr 10:00-18:00', atOpening);
    expect(result.statusReason).toBe('currently_open');
  });

  it('flags currently_closed at exactly closing time', () => {
    const atClosing = new Date('2026-04-22T18:00:00Z');
    const result = parseOpeningHours('Mo-Fr 10:00-18:00', atClosing);
    expect(result.statusReason).toBe('currently_closed');
  });

  it('treats a clause with everything off as fully unparseable', () => {
    const result = parseOpeningHours('Mo-Su off');
    expect(result.statusReason).toBe('unparseable');
  });
});
