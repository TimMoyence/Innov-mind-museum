const ISO_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;
const DMY_REGEX = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/;

const pad = (value: number): string => value.toString().padStart(2, '0');

const isRealCalendarDate = (year: number, month: number, day: number): boolean => {
  const probe = new Date(Date.UTC(year, month - 1, day));
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
};

export function parseDateOfBirth(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let year: number;
  let month: number;
  let day: number;

  const isoMatch = ISO_REGEX.exec(trimmed);
  if (isoMatch) {
    year = Number(isoMatch[1]);
    month = Number(isoMatch[2]);
    day = Number(isoMatch[3]);
  } else {
    const dmyMatch = DMY_REGEX.exec(trimmed);
    if (!dmyMatch) return null;
    day = Number(dmyMatch[1]);
    month = Number(dmyMatch[2]);
    year = Number(dmyMatch[3]);
  }

  if (year < 1900 || year > new Date().getUTCFullYear()) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  if (!isRealCalendarDate(year, month, day)) return null;

  return `${String(year)}-${pad(month)}-${pad(day)}`;
}
