import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  useDataModePreferenceStore,
  type DataModePreference,
} from '@/features/settings/dataModeStore';
import { GlassCard } from '@/shared/ui/GlassCard';
import { useTheme } from '@/shared/ui/ThemeContext';
import { semantic } from '@/shared/ui/tokens.semantic';
import { space } from '@/shared/ui/tokens.generated';

const OPTIONS: DataModePreference[] = ['auto', 'low', 'normal'];

const OPTION_LABEL_KEY = {
  auto: 'settings.dataMode.auto',
  low: 'settings.dataMode.low',
  normal: 'settings.dataMode.normal',
} as const;

/** Data-mode picker: auto / low / normal with description. */
export const DataModeSettingsSection = () => {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const preference = useDataModePreferenceStore((s) => s.preference);
  const setPreference = useDataModePreferenceStore((s) => s.setPreference);

  return (
    <GlassCard style={styles.card} intensity={56}>
      <Text style={[styles.cardTitle, { color: theme.textPrimary }]}>
        {t('settings.dataMode.title')}
      </Text>

      <View style={styles.optionsRow}>
        {OPTIONS.map((option) => {
          const isSelected = preference === option;
          return (
            <Pressable
              key={option}
              style={[
                styles.optionButton,
                {
                  backgroundColor: isSelected ? theme.primary : theme.surface,
                  borderColor: isSelected ? theme.primary : theme.cardBorder,
                },
              ]}
              onPress={() => {
                setPreference(option);
              }}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={t(OPTION_LABEL_KEY[option])}
            >
              <Text
                style={[
                  styles.optionLabel,
                  { color: isSelected ? theme.primaryContrast : theme.textPrimary },
                ]}
              >
                {t(OPTION_LABEL_KEY[option])}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {preference === 'auto' ? (
        <Text style={[styles.description, { color: theme.textSecondary }]}>
          {t('settings.dataMode.description')}
        </Text>
      ) : null}
    </GlassCard>
  );
};

const styles = StyleSheet.create({
  card: {
    padding: semantic.card.padding,
    gap: semantic.form.gap,
  },
  cardTitle: {
    fontWeight: '700',
    fontSize: semantic.card.titleSize,
  },
  optionsRow: {
    flexDirection: 'row',
    gap: semantic.card.gapSmall,
  },
  optionButton: {
    flex: 1,
    borderRadius: semantic.card.radiusCompact,
    borderWidth: semantic.input.borderWidth,
    paddingVertical: space['2.5'],
    alignItems: 'center',
  },
  optionLabel: {
    fontWeight: '600',
    fontSize: semantic.form.labelSize,
  },
  description: {
    fontSize: semantic.card.captionSize,
  },
});
