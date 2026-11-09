import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StyleSheet, View } from 'react-native';

import { MuseumPickerScreen, type SelectedMuseum } from '@/features/museum/ui/MuseumPickerScreen';
import { useStartConversation } from '@/features/chat/application/useStartConversation';
import { useTheme } from '@/shared/ui/ThemeContext';

export default function MuseumPickerRoute() {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { startConversation } = useStartConversation();

  const handleSelect = (museum: SelectedMuseum): void => {
    router.back();
    switch (museum.kind) {
      case 'local':
        void startConversation({
          skipSettings: true,
          museumMode: true,
          museumId: museum.museumId,
          museumName: museum.name,
        });
        break;
      case 'osm':
        void startConversation({ skipSettings: true });
        break;
    }
  };

  const handleClose = (): void => {
    router.back();
  };

  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: theme.cardBackground,
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
        },
      ]}
    >
      <MuseumPickerScreen onSelect={handleSelect} onClose={handleClose} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
