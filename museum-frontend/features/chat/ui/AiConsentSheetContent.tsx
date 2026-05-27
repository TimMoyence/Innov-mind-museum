import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import {
  THIRD_PARTY_AI_SCOPES,
  type ThirdPartyAiScope,
} from '@/features/chat/domain/consentScopes';
import { LiquidButton } from '@/shared/ui/LiquidButton';
import { useTheme } from '@/shared/ui/ThemeContext';
import { semantic, space, radius, fontSize } from '@/shared/ui/tokens';

import type { ParseKeys } from 'i18next';

interface AiConsentSheetContentProps {
  close: () => void;
  onAccept?: (grantedScopes?: readonly ThirdPartyAiScope[]) => void;
  onPrivacy?: () => void;
}

interface ReassuranceBullet {
  icon: keyof typeof Ionicons.glyphMap;
  copyKey: ParseKeys;
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

/**
 * Four reassurance bullets shown in the default `summary` view. The copy
 * lives in `consent.summary_*` keys (FR + EN translations) and is the
 * single source of truth for the "no personal data + no leak" message the
 * user explicitly asked for (2026-05-20). Icons are Ionicons — no emoji
 * unicode (CLAUDE.md gotcha + ast-grep `no-unicode-emoji-in-screen`).
 */
const SUMMARY_BULLETS: readonly ReassuranceBullet[] = [
  { icon: 'checkmark-circle-outline', copyKey: 'consent.summary_only_content' },
  { icon: 'shield-checkmark-outline', copyKey: 'consent.summary_no_personal_data' },
  { icon: 'lock-closed-outline', copyKey: 'consent.summary_processing' },
  { icon: 'settings-outline', copyKey: 'consent.summary_revoke_anytime' },
] as const;

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

/**
 * The two geo scopes are location data-sharing grants (NOT per-LLM-vendor
 * grants), so they render in their own "Location" group BELOW the provider grid
 * (design §2.2), never under OpenAI/Google. Both default OFF (GDPR Art. 4(11)
 * unambiguous affirmative action) and are mutually exclusive (D1 Option C —
 * `GEO_SCOPES` below drives the exclusivity in `toggle`):
 *   - `location_to_llm` = full / neighbourhood (`<neighbourhood>, <city>`).
 *   - `location_coarse_to_llm` = coarse / city + country only (Cycle 1.5-FE).
 * The BE consent gate (`location-resolver.ts:214-251`) is what actually
 * propagates the resolved location once one of these is granted.
 */
const LOCATION_ROWS: readonly RowSpec[] = [
  {
    scope: 'location_to_llm',
    icon: 'location-outline',
    labelKey: 'consent.scope_location',
    hintKey: 'consent.scope_location_hint',
    required: false,
  },
  {
    scope: 'location_coarse_to_llm',
    icon: 'business-outline',
    labelKey: 'consent.scope_location_coarse',
    hintKey: 'consent.scope_location_coarse_hint',
    required: false,
  },
] as const;

/**
 * The two mutually-exclusive geo scopes (D1 Option C). Enabling one forces the
 * other OFF in the sheet's local state, preventing the misleading "both ON"
 * state (where the BE silently lets full dominate). Derived from LOCATION_ROWS
 * so the source of truth stays single.
 */
const GEO_SCOPES: readonly ThirdPartyAiScope[] = LOCATION_ROWS.map((row) => row.scope);

const initialState = (): Record<ThirdPartyAiScope, boolean> =>
  Object.fromEntries(THIRD_PARTY_AI_SCOPES.map((s) => [s, false])) as Record<
    ThirdPartyAiScope,
    boolean
  >;

/**
 * Bottom-sheet content (full-screen presentation) for the granular third-party
 * AI consent gate. S4-P0-02 amendment 2026-05-20 — cookie-banner UX :
 *
 * - Default `summary` view : reassurance copy (no personal data, no leak,
 *   limited processing, revocation) + one-click "Accept all" CTA + secondary
 *   "Manage" CTA. The default path requires zero scope-by-scope decision —
 *   GDPR Art. 7(1) compliant because (a) "Accept all" is an explicit
 *   affirmative act, (b) the four reassurance bullets give specific informed
 *   consent, (c) revocation is documented and reachable from Settings.
 *
 * - `manage` view (after pressing Manage) : 4 categories × 2 providers = 8
 *   independent Switches defaulting OFF (no pre-checked boxes — GDPR Art.
 *   4(11) + Apple 5.1.2(i) "unambiguous indication by a statement or clear
 *   affirmative action"). Save stays disabled with an EXPLICIT hint
 *   ("Enable 'OpenAI Text' to save your choices.") until the user actively
 *   toggles the mandatory `third_party_ai_text_openai` scope ON. Before
 *   2026-05-20 the disabled-state was opaque (button looked tappable but did
 *   nothing) which produced confused-user reports.
 */
export const AiConsentSheetContent = ({
  close,
  onAccept,
  onPrivacy,
}: AiConsentSheetContentProps) => {
  const { t } = useTranslation();
  const { theme } = useTheme();

  // View state — `summary` is the default cookie-banner-style landing.
  // `manage` exposes the granular switches once the user opts in to detail.
  // BottomSheetRouter remounts this content via `key={state.route}` on every
  // fresh open, so initialising to 'summary' here doubles as "fresh open =
  // fresh view" without an additional reset effect.
  const [view, setView] = useState<'summary' | 'manage'>('summary');

  // Granular switch state. Survives back-and-forth between summary↔manage
  // (intentional — a user who toggled then went Back keeps their choices).
  const [grants, setGrants] = useState<Record<ThirdPartyAiScope, boolean>>(initialState);

  const grantedScopes = useMemo(
    () => THIRD_PARTY_AI_SCOPES.filter((s): s is ThirdPartyAiScope => grants[s]),
    [grants],
  );

  const canSave = grants[REQUIRED_SCOPE];

  const handleAcceptAll = (): void => {
    // D1 Option C — the two geo scopes are mutually exclusive, so "Accept all"
    // cannot grant both. It grants the full level (`location_to_llm`) and OMITS
    // `location_coarse_to_llm` (full dominates coarse on the BE anyway).
    const acceptAllScopes = THIRD_PARTY_AI_SCOPES.filter((s) => s !== 'location_coarse_to_llm');
    onAccept?.(acceptAllScopes);
    close();
  };

  const handleSaveManaged = (): void => {
    onAccept?.(grantedScopes);
    close();
  };

  const toggle = (scope: ThirdPartyAiScope): void => {
    setGrants((prev) => {
      const nextValue = !prev[scope];
      const next = { ...prev, [scope]: nextValue };
      // D1 Option C — geo exclusivity: turning a geo scope ON forces the other
      // geo scope OFF (never "both ON", which would mislead the user since the
      // BE silently lets full dominate coarse).
      if (nextValue && GEO_SCOPES.includes(scope)) {
        for (const other of GEO_SCOPES) {
          if (other !== scope) next[other] = false;
        }
      }
      return next;
    });
  };

  if (view === 'summary') {
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
            {SUMMARY_BULLETS.map((bullet) => (
              <View key={bullet.icon} style={styles.infoRow}>
                <Ionicons name={bullet.icon} size={20} color={theme.primary} />
                <Text style={[styles.infoText, { color: theme.textSecondary }]}>
                  {t(bullet.copyKey)}
                </Text>
              </View>
            ))}
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
            label={t('consent.accept_all')}
            onPress={handleAcceptAll}
            variant="primary"
            size="lg"
            accessibilityLabel={t('consent.accept_all')}
          />
          <View style={styles.footerSpacer} />
          <LiquidButton
            label={t('consent.manage_choices')}
            onPress={() => {
              setView('manage');
            }}
            variant="secondary"
            size="lg"
            accessibilityLabel={t('consent.manage_choices')}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.cardBackground }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable
          onPress={() => {
            setView('summary');
          }}
          accessibilityRole="button"
          accessibilityLabel={t('consent.back_to_summary')}
          style={styles.backRow}
        >
          <Ionicons name="chevron-back" size={20} color={theme.primary} />
          <Text style={[styles.backLabel, { color: theme.primary }]}>
            {t('consent.back_to_summary')}
          </Text>
        </Pressable>

        <Text style={[styles.title, { color: theme.textPrimary }]}>
          {t('consent.manage_title')}
        </Text>

        <Text style={[styles.body, { color: theme.textSecondary }]}>
          {t('consent.manage_subtitle')}
        </Text>

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
                  testID={`consent-switch-${row.scope}`}
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

        <View
          style={[
            styles.infoCard,
            { backgroundColor: theme.surface, borderColor: theme.cardBorder },
          ]}
        >
          {LOCATION_ROWS.map((row) => (
            <View key={row.scope} style={styles.switchRow}>
              <Ionicons name={row.icon} size={20} color={theme.primary} style={styles.switchIcon} />
              <View style={styles.switchInfo}>
                <Text style={[styles.switchLabel, { color: theme.textPrimary }]}>
                  {t(row.labelKey)}
                </Text>
                <Text style={[styles.switchHint, { color: theme.textSecondary }]}>
                  {t(row.hintKey)}
                </Text>
              </View>
              <Switch
                testID={`consent-switch-${row.scope}`}
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

        <Pressable
          onPress={onPrivacy}
          accessibilityRole="link"
          accessibilityLabel={t('consent.read_privacy')}
        >
          <Text style={[styles.link, { color: theme.primary }]}>{t('consent.read_privacy')}</Text>
        </Pressable>
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: theme.separator }]}>
        {!canSave ? (
          <View style={styles.saveHintRow}>
            <Ionicons name="alert-circle-outline" size={16} color={theme.textSecondary} />
            <Text style={[styles.saveHint, { color: theme.textSecondary }]}>
              {t('consent.save_required_hint')}
            </Text>
          </View>
        ) : null}
        <LiquidButton
          label={t('consent.save_and_continue')}
          onPress={handleSaveManaged}
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
  footerSpacer: {
    height: semantic.card.gapSmall,
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: space['1'],
    marginBottom: semantic.card.gapTiny,
  },
  backLabel: {
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  saveHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space['1.5'],
    marginBottom: semantic.card.gapSmall,
  },
  saveHint: {
    fontSize: fontSize.sm,
    flexShrink: 1,
  },
});
