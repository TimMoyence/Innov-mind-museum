import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  useDataModePreferenceStore,
  type DataModePreference,
} from '@/features/settings/dataModeStore';
import { GlassCard } from '@/shared/ui/GlassCard';
import { useTheme } from '@/shared/ui/ThemeContext';

const OPTIONS: DataModePreference[] = ['auto', 'low', 'normal'];

const OPTION_LABEL_KEY: Record<DataModePreference, string> = {
  auto: 'settings.dataMode.auto',
  low: 'settings.dataMode.low',
  normal: 'settings.dataMode.normal',
};

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
    padding: 16,
    gap: 10,
  },
  cardTitle: {
    fontWeight: '700',
    fontSize: 17,
  },
  optionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  optionButton: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 10,
    alignItems: 'center',
  },
  optionLabel: {
    fontWeight: '600',
    fontSize: 13,
  },
  description: {
    fontSize: 12,
  },
});
