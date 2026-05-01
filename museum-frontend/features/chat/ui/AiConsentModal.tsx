import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { LiquidButton } from '@/shared/ui/LiquidButton';
import { useTheme } from '@/shared/ui/ThemeContext';
import { semantic, space, radius, fontSize } from '@/shared/ui/tokens';

interface AiConsentModalProps {
  visible: boolean;
  onAccept: () => void;
  onPrivacy: () => void;
}

/** Full-screen modal shown once before first AI chat to inform users responses are AI-generated. */
export const AiConsentModal = ({ visible, onAccept, onPrivacy }: AiConsentModalProps) => {
  const { t } = useTranslation();
  const { theme } = useTheme();

  return (
    <Modal visible={visible} animationType="slide" transparent={false} statusBarTranslucent>
      <View style={[styles.container, { backgroundColor: theme.cardBackground }]}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={[styles.iconCircle, { backgroundColor: theme.primaryTint }]}>
            <Ionicons name="sparkles" size={36} color={theme.primary} />
          </View>

          <Text style={[styles.title, { color: theme.textPrimary }]}>{t('consent.title')}</Text>

          <Text style={[styles.body, { color: theme.textSecondary }]}>{t('consent.body')}</Text>

          <View
            style={[
              styles.infoCard,
              { backgroundColor: theme.surface, borderColor: theme.cardBorder },
            ]}
          >
            <View style={styles.infoRow}>
              <Ionicons name="information-circle-outline" size={20} color={theme.primary} />
              <Text style={[styles.infoText, { color: theme.textSecondary }]}>
                {t('consent.info_accuracy')}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Ionicons name="shield-checkmark-outline" size={20} color={theme.primary} />
              <Text style={[styles.infoText, { color: theme.textSecondary }]}>
                {t('consent.info_privacy')}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Ionicons name="flag-outline" size={20} color={theme.primary} />
              <Text style={[styles.infoText, { color: theme.textSecondary }]}>
                {t('consent.info_report')}
              </Text>
            </View>
          </View>

          <View
            style={[
              styles.infoCard,
              { backgroundColor: theme.surface, borderColor: theme.cardBorder },
            ]}
          >
            <Text style={[styles.dataTitle, { color: theme.textPrimary }]}>
              {t('consent.data_shared_title')}
            </Text>
            <View style={styles.infoRow}>
              <Ionicons name="chatbubble-outline" size={20} color={theme.primary} />
              <Text style={[styles.infoText, { color: theme.textSecondary }]}>
                {t('consent.data_text')}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Ionicons name="image-outline" size={20} color={theme.primary} />
              <Text style={[styles.infoText, { color: theme.textSecondary }]}>
                {t('consent.data_images')}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Ionicons name="mic-outline" size={20} color={theme.primary} />
              <Text style={[styles.infoText, { color: theme.textSecondary }]}>
                {t('consent.data_audio')}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Ionicons name="location-outline" size={20} color={theme.primary} />
              <Text style={[styles.infoText, { color: theme.textSecondary }]}>
                {t('consent.data_location')}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Ionicons name="person-outline" size={20} color={theme.primary} />
              <Text style={[styles.infoText, { color: theme.textSecondary }]}>
                {t('consent.data_profile')}
              </Text>
            </View>
          </View>

          <Pressable
            onPress={onPrivacy}
            accessibilityRole="link"
            accessibilityLabel={t('consent.read_privacy')}
          >
            <Text style={[styles.link, { color: theme.primary }]}>{t('consent.read_privacy')}</Text>
          </Pressable>
        </ScrollView>

        <View style={[styles.footer, { borderTopColor: theme.separator }]}>
          <LiquidButton
            label={t('consent.accept')}
            onPress={onAccept}
            variant="primary"
            size="lg"
            accessibilityLabel={t('consent.accept')}
          />
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: semantic.screen.paddingXL,
    paddingTop: semantic.media.safeAreaTop,
    paddingBottom: semantic.screen.paddingLarge,
    gap: semantic.modal.padding,
    alignItems: 'center',
  },
  iconCircle: {
    width: space['18'],
    height: space['18'],
    borderRadius: radius['5xl'],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: semantic.card.gapTiny,
  },
  title: {
    fontSize: fontSize['2xl'],
    fontWeight: '700',
    textAlign: 'center',
  },
  body: {
    fontSize: fontSize['base-'],
    lineHeight: semantic.chat.iconSize,
    textAlign: 'center',
  },
  infoCard: {
    width: '100%',
    borderRadius: semantic.button.radius,
    borderWidth: semantic.input.borderWidth,
    padding: semantic.card.padding,
    gap: semantic.form.gapLarge,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space['2.5'],
  },
  infoText: {
    flex: 1,
    fontSize: fontSize.sm,
    lineHeight: semantic.modal.padding,
  },
  dataTitle: {
    fontSize: fontSize['base-'],
    fontWeight: '600',
    marginBottom: space['0.5'],
  },
  link: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  footer: {
    paddingHorizontal: semantic.screen.paddingXL,
    paddingVertical: semantic.modal.padding,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
