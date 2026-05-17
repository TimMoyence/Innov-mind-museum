/**
 * Parse user-typed date of birth into ISO 8601 YYYY-MM-DD.
 *
 * Accepts the four formats French/EN users naturally type:
 *   - YYYY-MM-DD (ISO, what the backend expects)
 *   - DD/MM/YYYY (FR civic format — Apple iOS keyboard locale default)
 *   - DD-MM-YYYY
 *   - DD.MM.YYYY
 *
 * Returns the normalized ISO string when the date is well-formed AND
 * represents a real calendar day in the past (year < current year, valid
 * month/day, leap-year aware via Date roundtrip). Returns null otherwise.
 *
 * Used by:
 *   - features/auth/ui/RegisterForm.tsx     (submit-button gating)
 *   - features/auth/application/useEmailPasswordAuth.ts (API normalization)
 *   - app/auth.tsx Zod schema               (form-level validation)
 *
 * Server (museum-backend) re-validates and computes age (CNIL Délib.
 * 2021-018 — French digital majority 15y). This is a UX-side parser, not
 * an authoritative age check.
 */

const ISO_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;
const DMY_REGEX = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/;

const pad = (value: number): string => value.toString().padStart(2, '0');

const isRealCalendarDate = (year: number, month: number, day: number): boolean => {
  // Date roundtrip catches Feb 30, Apr 31, leap-year edges, etc.
  const probe = new Date(Date.UTC(year, month - 1, day));
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
};

/**
 * @param raw - User-typed string. Trimmed internally.
 * @returns ISO 8601 YYYY-MM-DD string, or null if the input is empty,
 *   malformed, or represents an impossible calendar date.
 */
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

  return `${year}-${pad(month)}-${pad(day)}`;
}
