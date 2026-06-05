// Domain types for the hybrid museum enrichment flow (per-locale cache +
// async refresh via BullMQ). See `EnrichMuseumUseCase`.

import type {
  AdmissionFees,
  Collections,
  CurrentExhibitions,
  Accessibility,
} from '@shared/db/jsonb-schemas/museum-enrichment.schemas';

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
  /**
   * Rich JSONB fields. Free-form `Record<string, unknown> | null` (validated by
   * loose Zod schemas — no key is guaranteed). Surfaced to the mobile detail
   * screen; `null` when the column is empty. The async refresh worker does NOT
   * populate these (it only fetches summary/website/phone/imageUrl/openingHours)
   * so a worker refresh carrying `null` here must NOT overwrite a seeded value.
   */
  admissionFees: AdmissionFees | null;
  collections: Collections | null;
  currentExhibitions: CurrentExhibitions | null;
  accessibility: Accessibility | null;
  fetchedAt: string;
}

export type EnrichMuseumResult =
  | { status: 'ready'; data: MuseumEnrichmentView }
  | { status: 'pending'; jobId: string };
