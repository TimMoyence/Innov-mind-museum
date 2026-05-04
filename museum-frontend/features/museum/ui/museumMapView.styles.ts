import { StyleSheet } from 'react-native';

import { semantic } from '@/shared/ui/tokens';

/**
 * Styles for `MuseumMapView`. Extracted to keep the component shell under
 * the 300 LOC budget without changing any visual behaviour.
 */
export const museumMapViewStyles = StyleSheet.create({
  container: {
    flex: 1,
    position: 'relative',
  },
  map: {
    flex: 1,
    borderRadius: semantic.card.paddingLarge,
    borderWidth: semantic.input.borderWidth,
    overflow: 'hidden',
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: semantic.screen.paddingLarge,
  },
  emptyCard: {
    paddingVertical: semantic.button.paddingYCompact,
    paddingHorizontal: semantic.card.paddingLarge,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: semantic.card.bodySize,
    fontWeight: '600',
    textAlign: 'center',
  },
});
