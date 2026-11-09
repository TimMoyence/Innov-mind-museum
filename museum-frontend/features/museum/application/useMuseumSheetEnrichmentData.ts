import { useMemo } from 'react';

import { useTheme } from '@/shared/ui/ThemeContext';

import {
  type I18nTranslator,
  type OpeningHoursDisplay,
  formatOpeningHours,
} from './opening-hours.formatter';
import { type UseMuseumEnrichmentResult, useMuseumEnrichment } from './useMuseumEnrichment';
import type { MuseumWithDistance } from './useMuseumDirectory';

export interface UseMuseumSheetEnrichmentDataResult {
  enrichment: UseMuseumEnrichmentResult;
  enriched: UseMuseumEnrichmentResult['data'];
  hoursDisplay: OpeningHoursDisplay | null;
  hasRichContent: boolean;
  showEnrichmentLoader: boolean;
  hoursToneColor: string;
}

export const useMuseumSheetEnrichmentData = (
  museum: MuseumWithDistance | null,
  lang: string,
  t: I18nTranslator,
): UseMuseumSheetEnrichmentDataResult => {
  const { theme } = useTheme();
  const museumId = museum && museum.id > 0 ? museum.id : null;
  const enrichment = useMuseumEnrichment(museumId, lang);

  const hoursDisplay = useMemo(
    () => (enrichment.data ? formatOpeningHours(enrichment.data.openingHours, t) : null),
    [enrichment.data, t],
  );

  const enriched = enrichment.data;
  const hasRichContent =
    enriched !== null &&
    (enriched.imageUrl !== null ||
      enriched.summary !== null ||
      enriched.website !== null ||
      enriched.phone !== null ||
      hoursDisplay !== null);
  const showEnrichmentLoader = enrichment.status === 'loading' && !enriched;
  const hoursToneColor =
    hoursDisplay?.tone === 'positive'
      ? theme.success
      : hoursDisplay?.tone === 'warning'
        ? theme.warningText
        : theme.textSecondary;

  return {
    enrichment,
    enriched,
    hoursDisplay,
    hasRichContent,
    showEnrichmentLoader,
    hoursToneColor,
  };
};
