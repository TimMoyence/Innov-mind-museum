import { useEffect } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/shared/ui/ThemeContext';
import { semantic, space, radius, fontSize } from '@/shared/ui/tokens';
import { formatDistance } from '../application/formatDistance';
import { getCategoryStyle } from '../application/categoryColor';
import type { MuseumWithDistance } from '../application/useMuseumDirectory';

interface MuseumSheetProps {
  museum: MuseumWithDistance | null;
  isStartingChat?: boolean;
  onClose: () => void;
  onStartChat: (museum: MuseumWithDistance) => void;
  onOpenInMaps: (museum: MuseumWithDistance) => void;
  onViewDetails: (museum: MuseumWithDistance) => void;
}

const DESCRIPTION_MAX_CHARS = 140;

const truncate = (text: string | null | undefined, max: number): string | null => {
  if (!text) return null;
  const trimmed = text.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max).trimEnd()}…`;
};

export const MuseumSheet = ({
  museum,
  isStartingChat,
  onClose,
  onStartChat,
  onOpenInMaps,
  onViewDetails,
}: MuseumSheetProps) => {
  const { t } = useTranslation();
  const { theme } = useTheme();

  const visible = museum !== null;

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

  const category = getCategoryStyle(museum.museumType);
  const description = truncate(museum.description, DESCRIPTION_MAX_CHARS);
  const hasCoordinates = museum.latitude != null && museum.longitude != null;
  const distanceMeters = museum.distanceMeters;

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

          <View style={styles.headerRow}>
            <View style={styles.titleBlock}>
              <Text
                style={[styles.name, { color: theme.textPrimary }]}
                numberOfLines={2}
                accessibilityRole="header"
              >
                {museum.name}
              </Text>
              <View style={[styles.categoryChip, { backgroundColor: category.color + '1F' }]}>
                <View style={[styles.categoryDot, { backgroundColor: category.color }]} />
                <Text style={[styles.categoryLabel, { color: category.color }]}>
                  {t(category.labelKey)}
                </Text>
              </View>
            </View>
            <Pressable
              style={styles.closeButton}
              onPress={onClose}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('museumDirectory.close_sheet_a11y')}
            >
              <Ionicons name="close" size={22} color={theme.textSecondary} />
            </Pressable>
          </View>

          {museum.address ? (
            <View style={styles.infoRow}>
              <Ionicons name="location-outline" size={16} color={theme.textSecondary} />
              <Text style={[styles.addressText, { color: theme.textSecondary }]} numberOfLines={2}>
                {museum.address}
              </Text>
            </View>
          ) : null}

          {distanceMeters !== null ? (
            <View style={styles.infoRow}>
              <Ionicons name="navigate-outline" size={16} color={theme.primary} />
              <Text style={[styles.distanceText, { color: theme.primary }]}>
                {formatDistance(distanceMeters, t)}
              </Text>
            </View>
          ) : null}

          {description ? (
            <Text style={[styles.description, { color: theme.textSecondary }]} numberOfLines={3}>
              {description}
            </Text>
          ) : null}

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
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  sheet: {
    borderTopLeftRadius: radius['3xl'],
    borderTopRightRadius: radius['3xl'],
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: semantic.card.padding,
    paddingTop: space['2'],
    paddingBottom: space['6'],
    gap: space['2.5'],
  },
  handle: {
    alignSelf: 'center',
    width: space['10'],
    height: space['1'],
    borderRadius: radius.full,
    marginBottom: space['1.5'],
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space['2'],
  },
  titleBlock: {
    flex: 1,
    gap: space['1.5'],
  },
  name: {
    fontSize: fontSize.xl,
    fontWeight: '700',
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: semantic.card.gapTiny,
    paddingHorizontal: semantic.badge.paddingX,
    paddingVertical: semantic.badge.paddingY,
    borderRadius: radius.full,
  },
  categoryDot: {
    width: space['2'],
    height: space['2'],
    borderRadius: radius.full,
  },
  categoryLabel: {
    fontSize: semantic.badge.fontSize,
    fontWeight: '700',
  },
  closeButton: {
    padding: space['1'],
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: semantic.section.gapTight,
  },
  addressText: {
    flex: 1,
    fontSize: fontSize.sm,
    lineHeight: space['5'],
  },
  distanceText: {
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  description: {
    fontSize: fontSize.sm,
    lineHeight: space['5'],
  },
  primaryButton: {
    marginTop: space['1'],
    borderRadius: semantic.button.radius,
    paddingVertical: semantic.button.paddingYCompact,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: semantic.card.gapSmall,
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 8 },
  },
  primaryButtonDisabled: {
    opacity: 0.7,
  },
  primaryButtonText: {
    fontWeight: '700',
    fontSize: fontSize['base-'],
  },
  secondaryRow: {
    flexDirection: 'row',
    gap: space['2'],
  },
  secondaryButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: semantic.section.gapTight,
    borderWidth: semantic.input.borderWidth,
    borderRadius: radius.DEFAULT,
    paddingHorizontal: space['2.5'],
    paddingVertical: space['2'],
  },
  secondaryButtonText: {
    fontSize: semantic.form.labelSize,
    fontWeight: '600',
  },
});
