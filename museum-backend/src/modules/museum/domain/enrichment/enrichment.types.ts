import type {
  AdmissionFees,
  Collections,
  CurrentExhibitions,
  Accessibility,
} from '@shared/db/jsonb-schemas/museum-enrichment.schemas';

export type OpeningDay = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export type OpeningDayStatus = 'open' | 'closed' | 'unknown';

export interface ParsedOpeningDay {
  day: OpeningDay;
  opens: string | null;
  closes: string | null;
}

export interface ParsedOpeningHours {
  raw: string;
  status: OpeningDayStatus;
  statusReason: 'currently_open' | 'currently_closed' | 'unparseable' | 'no_data';
  closesAtLocal: string | null;
  opensAtLocal: string | null;
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
  admissionFees: AdmissionFees | null;
  collections: Collections | null;
  currentExhibitions: CurrentExhibitions | null;
  accessibility: Accessibility | null;
  fetchedAt: string;
}

export type EnrichMuseumResult =
  | { status: 'ready'; data: MuseumEnrichmentView }
  | { status: 'pending'; jobId: string };
