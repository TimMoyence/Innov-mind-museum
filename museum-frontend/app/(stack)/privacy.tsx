import { useMemo } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import {
  PRIVACY_POLICY_CONTENT,
  isPrivacyPlaceholderValue,
} from '@/features/legal/privacyPolicyContent';
import { PrivacyMetaRow } from '@/features/legal/ui/PrivacyMetaRow';
import { FloatingContextMenu } from '@/shared/ui/FloatingContextMenu';
import { semantic } from '@/shared/ui/tokens';
import { GlassCard } from '@/shared/ui/GlassCard';
import { LiquidScreen } from '@/shared/ui/LiquidScreen';
import { pickMuseumBackground } from '@/shared/ui/liquidTheme';
import { useTheme } from '@/shared/ui/ThemeContext';
import { styles } from './privacy.styles';

interface MetaItem {
  label: string;
  value: string;
}

/** Renders the GDPR/RGPD privacy policy screen with legal metadata, rights summary, and release readiness status. */
export default function PrivacyScreen() {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const metaItems = useMemo<MetaItem[]>(
    () => [
      { label: 'Version', value: PRIVACY_POLICY_CONTENT.version },
      { label: 'Last updated', value: PRIVACY_POLICY_CONTENT.lastUpdated },
      { label: 'Controller', value: PRIVACY_POLICY_CONTENT.controllerName },
      { label: 'Address', value: PRIVACY_POLICY_CONTENT.controllerAddress },
      { label: 'Privacy contact', value: PRIVACY_POLICY_CONTENT.contactEmail },
      { label: 'DPO contact', value: PRIVACY_POLICY_CONTENT.dpoContact },
    ],
    [],
  );

  const unresolvedMetaCount = metaItems.filter((item) =>
    isPrivacyPlaceholderValue(item.value),
  ).length;
  const hasReleaseWork = unresolvedMetaCount > 0;

  return (
    <LiquidScreen
      background={pickMuseumBackground(4)}
      contentStyle={[styles.screen, { paddingTop: insets.top + semantic.screen.gapSmall }]}
    >
      <View style={styles.menuWrap}>
        <FloatingContextMenu
          actions={[
            {
              id: 'support',
              icon: 'headset-outline',
              label: t('privacy.menu.support'),
              onPress: () => {
                router.push('/(stack)/support');
              },
            },
            {
              id: 'prefs',
              icon: 'options-outline',
              label: t('privacy.menu.preferences'),
              onPress: () => {
                router.push('/(stack)/preferences');
              },
            },
            {
              id: 'settings',
              icon: 'settings-outline',
              label: t('privacy.menu.settings'),
              onPress: () => {
                router.push('/(stack)/settings');
              },
            },
          ]}
        />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + semantic.screen.padding },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <GlassCard style={styles.heroCard} intensity={60}>
          <View style={styles.heroHeader}>
            <Text style={[styles.title, { color: theme.textPrimary }]}>
              {PRIVACY_POLICY_CONTENT.title}
            </Text>
            <View
              style={[
                styles.statusPill,
                hasReleaseWork
                  ? {
                      backgroundColor: theme.warningBackground,
                      borderColor: theme.warningBackground,
                    }
                  : {
                      backgroundColor: theme.successBackground,
                      borderColor: theme.successBackground,
                    },
              ]}
            >
              <Text
                style={[
                  styles.statusPillText,
                  { color: hasReleaseWork ? theme.warningText : theme.success },
                ]}
              >
                {hasReleaseWork
                  ? t('privacy.pending_count', { count: unresolvedMetaCount })
                  : t('privacy.status_ready')}
              </Text>
            </View>
          </View>

          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            {t('privacy.subtitle')}
          </Text>

          <View style={styles.metaList}>
            {metaItems.map((item) => (
              <PrivacyMetaRow
                key={item.label}
                label={item.label}
                value={item.value}
                styles={styles}
              />
            ))}
          </View>
        </GlassCard>

        <GlassCard style={styles.card} intensity={54}>
          <Text style={[styles.cardTitle, { color: theme.textPrimary }]}>
            {t('privacy.quick_facts')}
          </Text>
          <View style={styles.quickFactsList}>
            {PRIVACY_POLICY_CONTENT.quickFacts.map((fact) => (
              <View
                key={fact.label}
                style={[
                  styles.quickFactRow,
                  { borderColor: theme.cardBorder, backgroundColor: theme.surface },
                ]}
              >
                <Text style={[styles.quickFactLabel, { color: theme.textPrimary }]}>
                  {fact.label}
                </Text>
                <Text style={[styles.quickFactValue, { color: theme.textSecondary }]}>
                  {fact.value}
                </Text>
              </View>
            ))}
          </View>
        </GlassCard>

        <GlassCard style={styles.card} intensity={54}>
          <Text style={[styles.cardTitle, { color: theme.textPrimary }]}>
            {t('privacy.gdpr_rights')}
          </Text>
          <View style={styles.bulletGroup}>
            {PRIVACY_POLICY_CONTENT.rightsSummary.map((item) => (
              <Text key={item} style={[styles.bulletText, { color: theme.textSecondary }]}>
                • {item}
              </Text>
            ))}
          </View>
        </GlassCard>

        {hasReleaseWork ? (
          <GlassCard
            style={[styles.warningCard, { borderColor: theme.warningBackground }]}
            intensity={58}
          >
            <Text style={[styles.warningTitle, { color: theme.warningText }]}>
              {t('privacy.prerelease_title')}
            </Text>
            <Text style={[styles.warningText, { color: theme.warningText }]}>
              {t('privacy.prerelease_text')}
            </Text>
            <View style={styles.bulletGroup}>
              {PRIVACY_POLICY_CONTENT.releaseChecklist.map((item) => (
                <Text key={item} style={[styles.warningBullet, { color: theme.warningText }]}>
                  • {item}
                </Text>
              ))}
            </View>
          </GlassCard>
        ) : null}

        <GlassCard style={styles.card} intensity={52}>
          <Text style={[styles.cardTitle, { color: theme.textPrimary }]}>
            {t('privacy.policy_contents')}
          </Text>
          <View style={styles.sectionIndex}>
            {PRIVACY_POLICY_CONTENT.sections.map((section) => (
              <Text
                key={section.id}
                style={[styles.sectionIndexItem, { color: theme.textSecondary }]}
              >
                • {section.title}
              </Text>
            ))}
          </View>
        </GlassCard>

        {PRIVACY_POLICY_CONTENT.sections.map((section) => (
          <GlassCard key={section.id} style={styles.sectionCard} intensity={52}>
            <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>{section.title}</Text>
            <View style={styles.paragraphGroup}>
              {section.paragraphs.map((paragraph, index) => (
                <Text
                  key={`${section.id}-${String(index)}`}
                  style={[styles.paragraph, { color: theme.textSecondary }]}
                >
                  {paragraph}
                </Text>
              ))}
            </View>
          </GlassCard>
        ))}

        <GlassCard style={styles.ctaCard} intensity={54}>
          <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>
            {t('privacy.request_title')}
          </Text>
          <Text style={[styles.paragraph, { color: theme.textSecondary }]}>
            {t('privacy.request_text')}
          </Text>
          <View style={styles.ctaRow}>
            <Pressable
              style={[styles.primaryButton, { backgroundColor: theme.primary }]}
              onPress={() => {
                router.push('/(stack)/support');
              }}
              accessibilityRole="button"
              accessibilityLabel={t('a11y.privacy.open_support')}
            >
              <Text style={[styles.primaryButtonText, { color: theme.primaryContrast }]}>
                {t('privacy.open_support')}
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.secondaryButton,
                { borderColor: theme.inputBorder, backgroundColor: theme.overlay },
              ]}
              onPress={() => {
                router.push('/(stack)/settings');
              }}
              accessibilityRole="button"
              accessibilityLabel={t('a11y.privacy.back_settings')}
            >
              <Text style={[styles.secondaryButtonText, { color: theme.textPrimary }]}>
                {t('privacy.back_settings')}
              </Text>
            </Pressable>
          </View>
        </GlassCard>
      </ScrollView>
    </LiquidScreen>
  );
}
