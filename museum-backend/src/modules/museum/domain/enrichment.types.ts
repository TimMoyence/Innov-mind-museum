/**
 * Domain types for the hybrid museum enrichment flow (per-locale cache +
 * async refresh via BullMQ). See `EnrichMuseumUseCase`.
 */

/** Day-of-week short codes used by the OSM opening-hours parser. */
export type OpeningDay = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

/** High-level status derived from the weekly schedule + current time. */
export type OpeningDayStatus = 'open' | 'closed' | 'unknown';

/** One weekly row (null opens/closes = closed that day). */
export interface ParsedOpeningDay {
  day: OpeningDay;
  /** `HH:mm` local time, or null when closed that day. */
  opens: string | null;
  /** `HH:mm` local time, or null when closed that day. */
  closes: string | null;
}

/** Shape returned by `parseOpeningHours` — structured OSM opening_hours tag. */
export interface ParsedOpeningHours {
  /** Original OSM value, kept for debugging + offline fallback. */
  raw: string;
  status: OpeningDayStatus;
  statusReason: 'currently_open' | 'currently_closed' | 'unparseable' | 'no_data';
  /** `HH:mm` local time the museum closes today, or null. */
  closesAtLocal: string | null;
  /** `HH:mm` local time the museum opens today, or null. */
  opensAtLocal: string | null;
  /** Full week schedule (Mon→Sun). */
  weekly: ParsedOpeningDay[];
}

/** Projection exposed to clients — persisted cache row flattened. */
export interface MuseumEnrichmentView {
  museumId: number;
  locale: string;
  summary: string | null;
  wikidataQid: string | null;
  website: string | null;
  phone: string | null;
  imageUrl: string | null;
  openingHours: ParsedOpeningHours | null;
  fetchedAt: string;
}

/** Result returned by `EnrichMuseumUseCase.execute` and `.getJobStatus`. */
export type EnrichMuseumResult =
  | { status: 'ready'; data: MuseumEnrichmentView }
  | { status: 'pending'; jobId: string };
