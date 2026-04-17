import { semantic } from '@/shared/ui/tokens';

import type { MuseumCategory } from '../infrastructure/museumApi';

export interface CategoryStyle {
  color: string;
  labelKey: `museumDirectory.category.${MuseumCategory}`;
}

const CATEGORY_TO_COLOR: Record<MuseumCategory, string> = {
  art: semantic.mapMarker.museum,
  history: semantic.mapMarker.restaurant,
  science: semantic.mapMarker.cafe,
  specialized: semantic.mapMarker.shop,
  general: semantic.mapMarker.default,
};

export const getCategoryStyle = (category: MuseumCategory | null | undefined): CategoryStyle => {
  const resolved: MuseumCategory = category ?? 'general';
  return {
    color: CATEGORY_TO_COLOR[resolved],
    labelKey: `museumDirectory.category.${resolved}`,
  };
};
