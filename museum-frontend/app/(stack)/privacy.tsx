import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import {
  PRIVACY_POLICY_CONTENT,
  isPrivacyPlaceholderValue,
} from '@/features/legal/privacyPolicyContent';
import { FloatingContextMenu } from '@/shared/ui/FloatingContextMenu';
import { GlassCard } from '@/shared/ui/GlassCard';
import { LiquidScreen } from '@/shared/ui/LiquidScreen';
import { liquidColors, pickMuseumBackground } from '@/shared/ui/liquidTheme';

interface MetaItem {
  label: string;
  value: string;
}

function MetaRow({ label, value }: MetaItem) {
  const isPlaceholder = isPrivacyPlaceholderValue(value);

  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaLabel}>{label}</Text>
      <View style={styles.metaValueWrap}>
        <Text style={[styles.metaValue, isPlaceholder && styles.metaValuePlaceholder]}>
          {value}
        </Text>
        {isPlaceholder ? <Text style={styles.pendingBadge}>To complete</Text> : null}
      </View>
    </View>
  );
}

export default function PrivacyScreen() {
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

  const unresolvedMetaCount = metaItems.filter((item) => isPrivacyPlaceholderValue(item.value)).length;
  const hasReleaseWork = unresolvedMetaCount > 0;

  return (
    <LiquidScreen background={pickMuseumBackground(4)} contentStyle={styles.screen}>
      <View style={styles.menuWrap}>
        <FloatingContextMenu
          actions={[
            {
              id: 'support',
              icon: 'headset-outline',
              label: 'Support',
              onPress: () => router.push('/(stack)/support'),
            },
            {
              id: 'prefs',
              icon: 'options-outline',
              label: 'Preferences',
              onPress: () => router.push('/(stack)/preferences'),
            },
            {
              id: 'settings',
              icon: 'settings-outline',
              label: 'Settings',
              onPress: () => router.push('/(stack)/settings'),
            },
          ]}
        />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <GlassCard style={styles.heroCard} intensity={60}>
          <View style={styles.heroHeader}>
            <Text style={styles.title}>{PRIVACY_POLICY_CONTENT.title}</Text>
            <View style={[styles.statusPill, hasReleaseWork ? styles.statusPillPending : styles.statusPillReady]}>
              <Text style={[styles.statusPillText, hasReleaseWork ? styles.statusPillTextPending : styles.statusPillTextReady]}>
                {hasReleaseWork ? `${unresolvedMetaCount} legal fields pending` : 'Release-ready metadata'}
              </Text>
            </View>
          </View>

          <Text style={styles.subtitle}>
            This page explains how MuseumIA processes personal data, user rights under GDPR/RGPD,
            and how to contact support for privacy requests.
          </Text>

          <View style={styles.metaList}>
            {metaItems.map((item) => (
              <MetaRow key={item.label} label={item.label} value={item.value} />
            ))}
          </View>
        </GlassCard>

        <GlassCard style={styles.card} intensity={54}>
          <Text style={styles.cardTitle}>Quick Facts</Text>
          <View style={styles.quickFactsList}>
            {PRIVACY_POLICY_CONTENT.quickFacts.map((fact) => (
              <View key={fact.label} style={styles.quickFactRow}>
                <Text style={styles.quickFactLabel}>{fact.label}</Text>
                <Text style={styles.quickFactValue}>{fact.value}</Text>
              </View>
            ))}
          </View>
        </GlassCard>

        <GlassCard style={styles.card} intensity={54}>
          <Text style={styles.cardTitle}>Your GDPR Rights (Summary)</Text>
          <View style={styles.bulletGroup}>
            {PRIVACY_POLICY_CONTENT.rightsSummary.map((item) => (
              <Text key={item} style={styles.bulletText}>
                • {item}
              </Text>
            ))}
          </View>
        </GlassCard>

        {hasReleaseWork ? (
          <GlassCard style={styles.warningCard} intensity={58}>
            <Text style={styles.warningTitle}>Pre-release legal completion checklist</Text>
            <Text style={styles.warningText}>
              These items should be validated before publishing to stores or production users.
            </Text>
            <View style={styles.bulletGroup}>
              {PRIVACY_POLICY_CONTENT.releaseChecklist.map((item) => (
                <Text key={item} style={styles.warningBullet}>
                  • {item}
                </Text>
              ))}
            </View>
          </GlassCard>
        ) : null}

        <GlassCard style={styles.card} intensity={52}>
          <Text style={styles.cardTitle}>Policy Contents</Text>
          <View style={styles.sectionIndex}>
            {PRIVACY_POLICY_CONTENT.sections.map((section) => (
              <Text key={section.id} style={styles.sectionIndexItem}>
                • {section.title}
              </Text>
            ))}
          </View>
        </GlassCard>

        {PRIVACY_POLICY_CONTENT.sections.map((section) => (
          <GlassCard key={section.id} style={styles.sectionCard} intensity={52}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={styles.paragraphGroup}>
              {section.paragraphs.map((paragraph, index) => (
                <Text key={`${section.id}-${index}`} style={styles.paragraph}>
                  {paragraph}
                </Text>
              ))}
            </View>
          </GlassCard>
        ))}

        <GlassCard style={styles.ctaCard} intensity={54}>
          <Text style={styles.sectionTitle}>Privacy request support</Text>
          <Text style={styles.paragraph}>
            For access, deletion, rectification, or objection requests, contact the team via the support
            page and include “privacy request” in your message until a dedicated legal workflow is
            finalized.
          </Text>
          <View style={styles.ctaRow}>
            <Pressable style={styles.primaryButton} onPress={() => router.push('/(stack)/support')}>
              <Text style={styles.primaryButtonText}>Open Support</Text>
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={() => router.push('/(stack)/settings')}>
              <Text style={styles.secondaryButtonText}>Back to Settings</Text>
            </Pressable>
          </View>
        </GlassCard>
      </ScrollView>
    </LiquidScreen>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingTop: 28,
    paddingHorizontal: 18,
    paddingBottom: 14,
  },
  menuWrap: {
    alignItems: 'center',
    marginBottom: 10,
  },
  scrollContent: {
    gap: 12,
    paddingBottom: 22,
  },
  heroCard: {
    padding: 18,
    gap: 10,
  },
  heroHeader: {
    gap: 8,
  },
  title: {
    color: liquidColors.textPrimary,
    fontSize: 24,
    fontWeight: '700',
  },
  statusPill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
  },
  statusPillPending: {
    backgroundColor: 'rgba(254,243,199,0.78)',
    borderColor: 'rgba(245,158,11,0.38)',
  },
  statusPillReady: {
    backgroundColor: 'rgba(220,252,231,0.78)',
    borderColor: 'rgba(34,197,94,0.34)',
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  statusPillTextPending: {
    color: '#92400E',
  },
  statusPillTextReady: {
    color: '#166534',
  },
  subtitle: {
    color: liquidColors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
  metaList: {
    gap: 8,
  },
  metaRow: {
    gap: 4,
  },
  metaLabel: {
    color: liquidColors.textPrimary,
    fontSize: 12,
    fontWeight: '700',
  },
  metaValueWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  metaValue: {
    color: liquidColors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  metaValuePlaceholder: {
    color: '#92400E',
    fontWeight: '700',
  },
  pendingBadge: {
    color: '#92400E',
    backgroundColor: 'rgba(254,243,199,0.82)',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.34)',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    fontWeight: '700',
    fontSize: 10,
  },
  card: {
    padding: 16,
    gap: 8,
  },
  warningCard: {
    padding: 16,
    gap: 8,
    borderColor: 'rgba(245,158,11,0.34)',
  },
  cardTitle: {
    color: liquidColors.textPrimary,
    fontWeight: '700',
    fontSize: 15,
  },
  warningTitle: {
    color: '#92400E',
    fontWeight: '700',
    fontSize: 15,
  },
  warningText: {
    color: '#78350F',
    fontSize: 13,
    lineHeight: 19,
  },
  warningBullet: {
    color: '#78350F',
    fontSize: 13,
    lineHeight: 20,
  },
  quickFactsList: {
    gap: 8,
  },
  quickFactRow: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.26)',
    backgroundColor: 'rgba(255,255,255,0.56)',
    padding: 10,
    gap: 3,
  },
  quickFactLabel: {
    color: liquidColors.textPrimary,
    fontWeight: '700',
    fontSize: 12,
  },
  quickFactValue: {
    color: liquidColors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  bulletGroup: {
    gap: 7,
  },
  bulletText: {
    color: liquidColors.textSecondary,
    fontSize: 13,
    lineHeight: 20,
  },
  sectionIndex: {
    gap: 6,
  },
  sectionIndexItem: {
    color: liquidColors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  sectionCard: {
    padding: 16,
    gap: 8,
  },
  sectionTitle: {
    color: liquidColors.textPrimary,
    fontWeight: '700',
    fontSize: 15,
  },
  paragraphGroup: {
    gap: 8,
  },
  paragraph: {
    color: liquidColors.textSecondary,
    fontSize: 13,
    lineHeight: 20,
  },
  ctaCard: {
    padding: 16,
    gap: 8,
  },
  ctaRow: {
    gap: 10,
    marginTop: 2,
  },
  primaryButton: {
    borderRadius: 12,
    backgroundColor: liquidColors.primary,
    alignItems: 'center',
    paddingVertical: 12,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  secondaryButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.45)',
    backgroundColor: 'rgba(255,255,255,0.70)',
    alignItems: 'center',
    paddingVertical: 12,
  },
  secondaryButtonText: {
    color: liquidColors.textPrimary,
    fontWeight: '700',
    fontSize: 13,
  },
});
