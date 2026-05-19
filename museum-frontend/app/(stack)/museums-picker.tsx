import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StyleSheet, View } from 'react-native';

import { MuseumPickerScreen } from '@/features/museum/ui/MuseumPickerScreen';
import { useStartConversation } from '@/features/chat/application/useStartConversation';
import { useTheme } from '@/shared/ui/ThemeContext';

/**
 * W3 — Museum picker screen entry (T4.3).
 *
 * Reached as a fallback from `useStartConversation` when auto-detect fails
 * (R14). On pick:
 *   - persists the choice to `museum.favourites` (handled inside the screen),
 *   - re-launches `startConversation` with the chosen museum so the user
 *     lands directly in chat — no extra tap.
 */
export default function MuseumPickerRoute() {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { startConversation } = useStartConversation();

  const handleSelect = ({ id, name }: { id: number; name: string }): void => {
    // Close the picker first so the chat session pushes on top of (stack)
    // root, not on top of the picker. router.back() is a safer dismiss than
    // router.replace() because the picker may be reached from multiple
    // entry points (auto-detect fallback, header CTA, etc.).
    router.back();
    void startConversation({
      skipSettings: true,
      museumMode: true,
      museumId: id,
      museumName: name,
    });
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
