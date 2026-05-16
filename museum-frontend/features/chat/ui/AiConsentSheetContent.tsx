import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import {
  THIRD_PARTY_AI_SCOPES,
  type ThirdPartyAiScope,
} from '@/features/chat/application/thirdPartyAiConsent';
import { LiquidButton } from '@/shared/ui/LiquidButton';
import { useTheme } from '@/shared/ui/ThemeContext';
import { semantic, space, radius, fontSize } from '@/shared/ui/tokens';

import type { ParseKeys } from 'i18next';

interface AiConsentSheetContentProps {
  close: () => void;
  onAccept?: (grantedScopes?: readonly ThirdPartyAiScope[]) => void;
  onPrivacy?: () => void;
}

interface RowSpec {
  scope: ThirdPartyAiScope;
  icon: keyof typeof Ionicons.glyphMap;
  labelKey: ParseKeys;
  hintKey: ParseKeys;
  required: boolean;
}

interface ProviderGroup {
  provider: 'openai' | 'google';
  labelKey: ParseKeys;
  rows: RowSpec[];
}

const PROVIDER_GROUPS: readonly ProviderGroup[] = [
  {
    provider: 'openai',
    labelKey: 'consent.provider_openai',
    rows: [
      {
        scope: 'third_party_ai_text_openai',
        icon: 'chatbubble-outline',
        labelKey: 'consent.scope_text',
        hintKey: 'consent.scope_text_hint',
        required: true,
      },
      {
        scope: 'third_party_ai_image_openai',
        icon: 'image-outline',
        labelKey: 'consent.scope_image',
        hintKey: 'consent.scope_image_hint',
        required: false,
      },
      {
        scope: 'third_party_ai_audio_openai',
        icon: 'mic-outline',
        labelKey: 'consent.scope_audio',
        hintKey: 'consent.scope_audio_hint',
        required: false,
      },
      {
        scope: 'third_party_ai_profile_openai',
        icon: 'person-outline',
        labelKey: 'consent.scope_profile',
        hintKey: 'consent.scope_profile_hint',
        required: false,
      },
    ],
  },
  {
    provider: 'google',
    labelKey: 'consent.provider_google',
    rows: [
      {
        scope: 'third_party_ai_text_google',
        icon: 'chatbubble-outline',
        labelKey: 'consent.scope_text',
        hintKey: 'consent.scope_text_hint',
        required: false,
      },
      {
        scope: 'third_party_ai_image_google',
        icon: 'image-outline',
        labelKey: 'consent.scope_image',
        hintKey: 'consent.scope_image_hint',
        required: false,
      },
      {
        scope: 'third_party_ai_audio_google',
        icon: 'mic-outline',
        labelKey: 'consent.scope_audio',
        hintKey: 'consent.scope_audio_hint',
        required: false,
      },
      {
        scope: 'third_party_ai_profile_google',
        icon: 'person-outline',
        labelKey: 'consent.scope_profile',
        hintKey: 'consent.scope_profile_hint',
        required: false,
      },
    ],
  },
] as const;

const REQUIRED_SCOPE: ThirdPartyAiScope = 'third_party_ai_text_openai';

const initialState = (): Record<ThirdPartyAiScope, boolean> =>
  Object.fromEntries(THIRD_PARTY_AI_SCOPES.map((s) => [s, false])) as Record<
    ThirdPartyAiScope,
    boolean
  >;

/**
 * Bottom-sheet content (full-screen presentation) for the granular third-party
 * AI consent gate. S4-P0-02 — Apple Guideline 5.1.2(i) requires explicit,
 * separate, non-bundled consent per (data category × AI provider). Each row
 * is an independent Switch defaulting OFF (no pre-checked boxes — GDPR Art.
 * 4(11) + Art. 7(1) "unambiguous indication by a statement or clear
 * affirmative action"). Save stays disabled until the user actively toggles
 * the mandatory `third_party_ai_text_openai` scope ON ; the required-row
 * label carries a `(required)` badge so the gate is discoverable.
 */
export const AiConsentSheetContent = ({
  close,
  onAccept,
  onPrivacy,
}: AiConsentSheetContentProps) => {
  const { t } = useTranslation();
  const { theme } = useTheme();

  // Local switch state ; the BottomSheetRouter remounts this Content via
  // `key={state.route}` on every open, so `useState(initialState)` is already
  // the source of truth for "fresh open = fresh switches" (no useEffect reset
  // pattern needed here, even though the CLAUDE.md `RN Modal` gotcha warns
  // about persistent hosts — the router is not such a host).
  const [grants, setGrants] = useState<Record<ThirdPartyAiScope, boolean>>(initialState);

  const grantedScopes = useMemo(
    () => THIRD_PARTY_AI_SCOPES.filter((s): s is ThirdPartyAiScope => grants[s]),
    [grants],
  );

  const canSave = grants[REQUIRED_SCOPE];

  const handleAccept = (): void => {
    onAccept?.(grantedScopes);
    close();
  };

  const toggle = (scope: ThirdPartyAiScope): void => {
    setGrants((prev) => ({ ...prev, [scope]: !prev[scope] }));
  };

  return (
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
              {t('consent.info_granular')}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="settings-outline" size={20} color={theme.primary} />
            <Text style={[styles.infoText, { color: theme.textSecondary }]}>
              {t('consent.info_revoke')}
            </Text>
          </View>
        </View>

        {PROVIDER_GROUPS.map((group) => (
          <View
            key={group.provider}
            style={[
              styles.infoCard,
              { backgroundColor: theme.surface, borderColor: theme.cardBorder },
            ]}
          >
            <Text style={[styles.dataTitle, { color: theme.textPrimary }]}>
              {t(group.labelKey)}
            </Text>
            {group.rows.map((row) => (
              <View key={row.scope} style={styles.switchRow}>
                <Ionicons
                  name={row.icon}
                  size={20}
                  color={theme.primary}
                  style={styles.switchIcon}
                />
                <View style={styles.switchInfo}>
                  <Text style={[styles.switchLabel, { color: theme.textPrimary }]}>
                    {t(row.labelKey)}
                    {row.required ? ` ${t('consent.required_badge')}` : ''}
                  </Text>
                  <Text style={[styles.switchHint, { color: theme.textSecondary }]}>
                    {t(row.hintKey)}
                  </Text>
                </View>
                <Switch
                  value={grants[row.scope]}
                  onValueChange={() => {
                    toggle(row.scope);
                  }}
                  trackColor={{ false: theme.cardBorder, true: theme.primary }}
                  accessibilityRole="switch"
                  accessibilityLabel={t(row.labelKey)}
                />
              </View>
            ))}
          </View>
        ))}

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
          label={t('consent.save_and_continue')}
          onPress={handleAccept}
          variant="primary"
          size="lg"
          disabled={!canSave}
          accessibilityLabel={t('consent.save_and_continue')}
        />
      </View>
    </View>
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
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space['2.5'],
  },
  switchIcon: {
    marginTop: space['0.5'],
  },
  switchInfo: {
    flex: 1,
    gap: space['0.5'],
  },
  switchLabel: {
    fontSize: semantic.card.bodySize,
    fontWeight: '600',
  },
  switchHint: {
    fontSize: semantic.card.captionSize,
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
