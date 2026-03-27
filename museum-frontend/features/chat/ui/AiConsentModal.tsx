import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';

import { useTheme } from '@/shared/ui/ThemeContext';

interface AiConsentModalProps {
  visible: boolean;
  onAccept: () => void;
}

/** Full-screen modal shown once before first AI chat to inform users responses are AI-generated. */
export const AiConsentModal = ({ visible, onAccept }: AiConsentModalProps) => {
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

          <Pressable
            onPress={() => {
              router.push('/(stack)/privacy');
            }}
            accessibilityRole="link"
          >
            <Text style={[styles.link, { color: theme.primary }]}>{t('consent.read_privacy')}</Text>
          </Pressable>
        </ScrollView>

        <View style={[styles.footer, { borderTopColor: theme.separator }]}>
          <Pressable
            style={[styles.acceptButton, { backgroundColor: theme.primary }]}
            onPress={onAccept}
            accessibilityRole="button"
            accessibilityLabel={t('consent.accept')}
          >
            <Text style={[styles.acceptText, { color: theme.primaryContrast }]}>
              {t('consent.accept')}
            </Text>
          </Pressable>
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
    paddingHorizontal: 28,
    paddingTop: 60,
    paddingBottom: 24,
    gap: 20,
    alignItems: 'center',
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  infoCard: {
    width: '100%',
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    gap: 14,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  link: {
    fontSize: 14,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  footer: {
    paddingHorizontal: 28,
    paddingVertical: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  acceptButton: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  acceptText: {
    fontSize: 17,
    fontWeight: '700',
  },
});
