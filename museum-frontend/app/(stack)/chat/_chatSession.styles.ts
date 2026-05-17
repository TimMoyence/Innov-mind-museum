import { StyleSheet } from 'react-native';

import { semantic, space } from '@/shared/ui/tokens';

export const styles = StyleSheet.create({
  screen: { paddingHorizontal: space['3.5'], paddingBottom: semantic.card.paddingCompact },
  flex: { flex: 1 },
  recordingStatus: {
    marginBottom: semantic.form.gap,
    textAlign: 'center',
    fontWeight: '700',
    fontSize: semantic.card.captionSize,
  },
  chatSurface: {
    flex: 1,
    paddingHorizontal: semantic.form.gap,
    paddingVertical: semantic.form.gap,
  },
  skeletonChat: { flex: 1, justifyContent: 'flex-start', paddingTop: semantic.card.paddingCompact },
  walkBanner: {
    textAlign: 'center',
    fontWeight: '600',
    fontSize: semantic.card.captionSize,
    marginBottom: semantic.form.gap,
  },
});
