import { StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { OfflineMapsSettings } from '@/features/settings/ui/OfflineMapsSettings';
import { LiquidScreen } from '@/shared/ui/LiquidScreen';
import { pickMuseumBackground } from '@/shared/ui/liquidTheme';
import { semantic } from '@/shared/ui/tokens';

export default function OfflineMapsScreen() {
  const insets = useSafeAreaInsets();
  return (
    <LiquidScreen
      background={pickMuseumBackground(2)}
      contentStyle={[
        styles.screen,
        {
          paddingTop: insets.top + semantic.screen.gapSmall,
          paddingBottom: insets.bottom + semantic.screen.gapSmall,
        },
      ]}
    >
      <OfflineMapsSettings />
    </LiquidScreen>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
});
