// Domain types for the hybrid museum enrichment flow (per-locale cache +
// async refresh via BullMQ). See `EnrichMuseumUseCase`.

export type OpeningDay = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export type OpeningDayStatus = 'open' | 'closed' | 'unknown';

/** One weekly row (null opens/closes = closed that day). */
export interface ParsedOpeningDay {
  day: OpeningDay;
  /** `HH:mm` local time, null when closed. */
  opens: string | null;
  /** `HH:mm` local time, null when closed. */
  closes: string | null;
}

export interface ParsedOpeningHours {
  /** Original OSM value, kept for debugging + offline fallback. */
  raw: string;
  status: OpeningDayStatus;
  statusReason: 'currently_open' | 'currently_closed' | 'unparseable' | 'no_data';
  /** `HH:mm` local time the museum closes today, or null. */
  closesAtLocal: string | null;
  /** `HH:mm` local time the museum opens today, or null. */
  opensAtLocal: string | null;
  /** Mon→Sun. */
  weekly: ParsedOpeningDay[];
}

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

export type EnrichMuseumResult =
  | { status: 'ready'; data: MuseumEnrichmentView }
  | { status: 'pending'; jobId: string };
