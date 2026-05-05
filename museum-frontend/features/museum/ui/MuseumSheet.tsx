import { useEffect } from 'react';
import { BackHandler, Modal, Pressable, ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/shared/ui/ThemeContext';

import { useMuseumSheetEnrichmentData } from '../application/useMuseumSheetEnrichmentData';
import type { MuseumWithDistance } from '../application/useMuseumDirectory';
import { MuseumSheetActions } from './MuseumSheetActions';
import { MuseumSheetEnrichmentBody } from './MuseumSheetEnrichmentBody';
import { MuseumSheetHeader } from './MuseumSheetHeader';
import { styles } from './museumSheet.styles';

interface MuseumSheetProps {
  museum: MuseumWithDistance | null;
  isStartingChat?: boolean;
  onClose: () => void;
  onStartChat: (museum: MuseumWithDistance) => void;
  onOpenInMaps: (museum: MuseumWithDistance) => void;
  onViewDetails: (museum: MuseumWithDistance) => void;
}

export const MuseumSheet = ({
  museum,
  isStartingChat,
  onClose,
  onStartChat,
  onOpenInMaps,
  onViewDetails,
}: MuseumSheetProps) => {
  const { t, i18n } = useTranslation();
  const { theme } = useTheme();

  const visible = museum !== null;
  // Enrichment is fetched eagerly the moment the sheet opens for a real
  // (positive-id) museum. Synthetic OSM entries use negative ids and are
  // skipped by the hook's `enabled` guard.
  const data = useMuseumSheetEnrichmentData(museum, i18n.language, t);

  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => {
      sub.remove();
    };
  }, [visible, onClose]);

  if (!museum) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <Pressable
          style={[styles.backdrop, { backgroundColor: theme.modalOverlay }]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('museumDirectory.close_sheet_a11y')}
        />
        <View
          style={[
            styles.sheet,
            { backgroundColor: theme.cardBackground, borderColor: theme.cardBorder },
          ]}
          accessibilityViewIsModal
        >
          <View style={[styles.handle, { backgroundColor: theme.separator }]} />

          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            bounces
          >
            <MuseumSheetHeader museum={museum} onClose={onClose} />
            <MuseumSheetEnrichmentBody
              museum={museum}
              enrichment={data.enrichment}
              enriched={data.enriched}
              hoursDisplay={data.hoursDisplay}
              hasRichContent={data.hasRichContent}
              showEnrichmentLoader={data.showEnrichmentLoader}
              hoursToneColor={data.hoursToneColor}
            />
            <MuseumSheetActions
              museum={museum}
              isStartingChat={isStartingChat}
              onStartChat={onStartChat}
              onOpenInMaps={onOpenInMaps}
              onViewDetails={onViewDetails}
            />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};
