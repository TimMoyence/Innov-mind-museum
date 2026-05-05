import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/shared/ui/ThemeContext';

import type { MuseumWithDistance } from '../application/useMuseumDirectory';
import { styles } from './museumSheet.styles';

interface MuseumSheetActionsProps {
  museum: MuseumWithDistance;
  isStartingChat?: boolean;
  onStartChat: (museum: MuseumWithDistance) => void;
  onOpenInMaps: (museum: MuseumWithDistance) => void;
  onViewDetails: (museum: MuseumWithDistance) => void;
}

export const MuseumSheetActions = ({
  museum,
  isStartingChat,
  onStartChat,
  onOpenInMaps,
  onViewDetails,
}: MuseumSheetActionsProps) => {
  const { t } = useTranslation();
  const { theme } = useTheme();

  const hasCoordinates = museum.latitude != null && museum.longitude != null;

  return (
    <>
      <Pressable
        style={[
          styles.primaryButton,
          { backgroundColor: theme.primary, shadowColor: theme.shadowColor },
          isStartingChat ? styles.primaryButtonDisabled : null,
        ]}
        onPress={() => {
          onStartChat(museum);
        }}
        disabled={isStartingChat}
        accessibilityRole="button"
        accessibilityLabel={t('museumDirectory.start_chat')}
      >
        {isStartingChat ? (
          <ActivityIndicator color={theme.primaryContrast} />
        ) : (
          <>
            <Ionicons name="chatbubble-outline" size={18} color={theme.primaryContrast} />
            <Text style={[styles.primaryButtonText, { color: theme.primaryContrast }]}>
              {t('museumDirectory.start_chat')}
            </Text>
          </>
        )}
      </Pressable>

      <View style={styles.secondaryRow}>
        {hasCoordinates ? (
          <Pressable
            style={[
              styles.secondaryButton,
              { borderColor: theme.inputBorder, backgroundColor: theme.surface },
            ]}
            onPress={() => {
              onOpenInMaps(museum);
            }}
            accessibilityRole="button"
            accessibilityLabel={t('museumDirectory.open_in_maps')}
          >
            <Ionicons name="navigate-outline" size={16} color={theme.primary} />
            <Text style={[styles.secondaryButtonText, { color: theme.primary }]}>
              {t('museumDirectory.open_in_maps')}
            </Text>
          </Pressable>
        ) : null}
        <Pressable
          style={[
            styles.secondaryButton,
            { borderColor: theme.inputBorder, backgroundColor: theme.surface },
          ]}
          onPress={() => {
            onViewDetails(museum);
          }}
          accessibilityRole="button"
          accessibilityLabel={t('museumDirectory.view_details')}
        >
          <Ionicons name="information-circle-outline" size={16} color={theme.primary} />
          <Text style={[styles.secondaryButtonText, { color: theme.primary }]}>
            {t('museumDirectory.view_details')}
          </Text>
        </Pressable>
      </View>
    </>
  );
};
