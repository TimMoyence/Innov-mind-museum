import { z } from 'zod';

import { LooseRecordSchema } from './loose-record.schema';

export const OpeningHoursSchema = LooseRecordSchema;
export type OpeningHours = z.infer<typeof OpeningHoursSchema>;

export const AdmissionFeesSchema = LooseRecordSchema;
export type AdmissionFees = z.infer<typeof AdmissionFeesSchema>;

export const CollectionsSchema = LooseRecordSchema;
export type Collections = z.infer<typeof CollectionsSchema>;

export const CurrentExhibitionsSchema = LooseRecordSchema;
export type CurrentExhibitions = z.infer<typeof CurrentExhibitionsSchema>;

export const AccessibilitySchema = LooseRecordSchema;
export type Accessibility = z.infer<typeof AccessibilitySchema>;

export const SourceUrlsSchema = z.array(z.string()).max(256);
export type SourceUrls = z.infer<typeof SourceUrlsSchema>;
