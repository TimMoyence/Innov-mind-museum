import type { ReactElement } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { useUpdateTtsVoice } from '@/features/settings/application/useUpdateTtsVoice';
import { SaveRefusalNotice } from '@/features/settings/ui/SaveRefusalNotice';
import { TTS_VOICES, type TtsVoice } from '@/features/settings/voice-catalog';
import { GlassCard } from '@/shared/ui/GlassCard';
import { useTheme } from '@/shared/ui/ThemeContext';
import { semantic, space } from '@/shared/ui/tokens';

interface Row {
  id: 'default' | TtsVoice;
  label: string;
}

export interface VoicePreferenceSectionProps {
  currentVoice: TtsVoice | null;
}

const capitalize = (v: string): string => v.charAt(0).toUpperCase() + v.slice(1);

export const VoicePreferenceSection = ({
  currentVoice,
}: VoicePreferenceSectionProps): ReactElement => {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const mutation = useUpdateTtsVoice();

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
      <SaveRefusalNotice refusal={mutation.error} />
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
