import { z } from 'zod';

import { LooseRecordSchema } from './loose-record.schema';

/**
 * openingHours, admissionFees, collections, currentExhibitions, accessibility:
 * These fields are populated by the LLM-based content classifier which produces
 * arbitrary Record<string, unknown> shaped data. The content-classifier service
 * already uses z.record(z.unknown()).nullable() internally. We mirror that here
 * rather than imposing a strict shape that would reject existing data.
 *
 * sourceUrls: array of URL strings — always maintained programmatically.
 */

/** Opening hours — loose record; shape depends on classifier output. */
export const OpeningHoursSchema = LooseRecordSchema;
/**
 *
 */
export type OpeningHours = z.infer<typeof OpeningHoursSchema>;

/** Admission fees — loose record; shape depends on classifier output. */
export const AdmissionFeesSchema = LooseRecordSchema;
/**
 *
 */
export type AdmissionFees = z.infer<typeof AdmissionFeesSchema>;

/** Collections — loose record; shape depends on classifier output. */
export const CollectionsSchema = LooseRecordSchema;
/**
 *
 */
export type Collections = z.infer<typeof CollectionsSchema>;

/** Current exhibitions — loose record; shape depends on classifier output. */
export const CurrentExhibitionsSchema = LooseRecordSchema;
/**
 *
 */
export type CurrentExhibitions = z.infer<typeof CurrentExhibitionsSchema>;

/** Accessibility — loose record; shape depends on classifier output. */
export const AccessibilitySchema = LooseRecordSchema;
/**
 *
 */
export type Accessibility = z.infer<typeof AccessibilitySchema>;

/**
 * Source URLs — strict array of strings. Always maintained programmatically
 * (typeorm-museum-enrichment.repo.ts spreads string arrays). Defaults to `[]`
 * so an empty array must be valid.
 */
export const SourceUrlsSchema = z.array(z.string()).max(256);
/**
 *
 */
export type SourceUrls = z.infer<typeof SourceUrlsSchema>;
