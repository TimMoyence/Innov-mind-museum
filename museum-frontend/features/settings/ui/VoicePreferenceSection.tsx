/**
 * VoicePreferenceSection (Spec C T2.9).
 *
 * Renders a 7-row list — a "Default" reset row at the top followed by the
 * 6 catalog voices (Alloy, Echo, Fable, Onyx, Nova, Shimmer). Voice display
 * names are un-translated proper nouns; the section title, description and
 * default-row label are i18n-driven.
 *
 * Tapping a row fires {@link useUpdateTtsVoice} with either the chosen
 * `TtsVoice` or `null` (the Default row resets the preference to the
 * env-level default). The mutation invalidates the `['me']` profile query
 * on success so the parent settings screen re-reads the persisted value.
 *
 * The currently-selected row is reflected via `accessibilityState.selected`
 * and a checkmark Ionicon. While a write is in flight, only the row that
 * triggered the mutation exposes `accessibilityState.busy=true` (per the
 * WAI-ARIA contract — busy marks the specific control being updated, so
 * VoiceOver doesn't announce "busy" on rows the user isn't waiting on).
 */
import type { ReactElement } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { useUpdateTtsVoice } from '@/features/settings/application/useUpdateTtsVoice';
import { TTS_VOICES, type TtsVoice } from '@/features/settings/voice-catalog';
import { GlassCard } from '@/shared/ui/GlassCard';
import { useTheme } from '@/shared/ui/ThemeContext';
import { semantic, space } from '@/shared/ui/tokens';

interface Row {
  id: 'default' | TtsVoice;
  label: string;
}

export interface VoicePreferenceSectionProps {
  /** The persisted TTS voice for the authenticated user, or `null` when no
   * preference is set (the env-level default voice is used at runtime). */
  currentVoice: TtsVoice | null;
}

const capitalize = (v: string): string => v.charAt(0).toUpperCase() + v.slice(1);

export const VoicePreferenceSection = ({
  currentVoice,
}: VoicePreferenceSectionProps): ReactElement => {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const mutation = useUpdateTtsVoice();

  // `mutation.variables` is the arg passed to mutate(): `null` on Default
  // press, `'echo' | 'alloy' | …` on a voice press. Track which row is
  // mid-write so only that row exposes `accessibilityState.busy` (per
  // WAI-ARIA — `busy` marks the specific control being updated).
  const pendingId: Row['id'] | null = mutation.isPending ? (mutation.variables ?? 'default') : null;

  const rows: Row[] = [
    { id: 'default', label: t('settings.voice.useDefault') },
    ...TTS_VOICES.map((v) => ({ id: v, label: capitalize(v) })),
  ];

  const isSelected = (row: Row): boolean =>
    (row.id === 'default' && currentVoice === null) || row.id === currentVoice;

  const onPress = (row: Row): void => {
    void Haptics.selectionAsync();
    mutation.mutate(row.id === 'default' ? null : row.id);
  };

  return (
    <GlassCard style={styles.card} intensity={56}>
      <Text style={[styles.cardTitle, { color: theme.textPrimary }]} accessibilityRole="header">
        {t('settings.voice.sectionTitle')}
      </Text>
      <Text style={[styles.hint, { color: theme.textSecondary }]}>
        {t('settings.voice.description')}
      </Text>
      {rows.map((row) => (
        <VoiceRow
          key={row.id}
          row={row}
          selected={isSelected(row)}
          busy={pendingId === row.id}
          onPress={onPress}
          theme={theme}
        />
      ))}
    </GlassCard>
  );
};

interface VoiceRowProps {
  row: Row;
  selected: boolean;
  busy: boolean;
  onPress: (row: Row) => void;
  theme: ReturnType<typeof useTheme>['theme'];
}

/** Single tappable row inside the voice section. Extracted to keep the
 * parent's render flat and to give each row a stable testID. */
const VoiceRow = ({ row, selected, busy, onPress, theme }: VoiceRowProps): ReactElement => (
  <Pressable
    testID={`voice-row-${row.id}`}
    accessibilityRole="button"
    accessibilityLabel={row.label}
    accessibilityState={{ selected, busy }}
    onPress={() => {
      onPress(row);
    }}
    style={[
      styles.row,
      { borderColor: theme.cardBorder },
      selected && {
        borderColor: theme.primary,
        backgroundColor: theme.primaryTint,
      },
    ]}
  >
    <Text style={[styles.rowLabel, { color: selected ? theme.primary : theme.textPrimary }]}>
      {row.label}
    </Text>
    {selected ? <Ionicons name="checkmark" size={20} color={theme.primary} /> : null}
  </Pressable>
);

const styles = StyleSheet.create({
  card: {
    padding: semantic.card.padding,
    gap: semantic.form.gap,
  },
  cardTitle: {
    fontWeight: '700',
    fontSize: semantic.card.titleSize,
  },
  hint: {
    fontSize: semantic.card.captionSize,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: semantic.card.radiusCompact,
    borderWidth: semantic.input.borderWidth,
    paddingVertical: space['2.5'],
    paddingHorizontal: space['3'],
  },
  rowLabel: {
    fontWeight: '600',
    fontSize: semantic.card.bodySize,
  },
});
