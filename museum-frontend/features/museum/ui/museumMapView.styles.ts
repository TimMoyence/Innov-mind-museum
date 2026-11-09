import { StyleSheet } from 'react-native';

import { semantic } from '@/shared/ui/tokens';

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
    start: 0,
    end: 0,
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
