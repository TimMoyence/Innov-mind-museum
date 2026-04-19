import { StyleSheet } from 'react-native';

import { OfflineMapsSettings } from '@/features/settings/ui/OfflineMapsSettings';
import { LiquidScreen } from '@/shared/ui/LiquidScreen';
import { pickMuseumBackground } from '@/shared/ui/liquidTheme';

export default function OfflineMapsScreen() {
  return (
    <LiquidScreen background={pickMuseumBackground(2)} contentStyle={styles.screen}>
      <OfflineMapsSettings />
    </LiquidScreen>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
});
