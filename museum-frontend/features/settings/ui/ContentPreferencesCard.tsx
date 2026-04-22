import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useContentPreferences } from '@/features/settings/application/useContentPreferences';
import { CONTENT_PREFERENCES, type ContentPreference } from '@/shared/types/content-preference';
import { GlassCard } from '@/shared/ui/GlassCard';
import { useTheme } from '@/shared/ui/ThemeContext';
import { semantic, space } from '@/shared/ui/tokens';

/**
 * Lets the visitor pick which aspects of an artwork they prefer to learn
 * about (history, technique, artist). Optional — empty means "no preference"
 * which is the zero-friction default. The LLM uses these as soft hints,
 * never as strict filters.
 */
export const ContentPreferencesCard = () => {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const { isSaving, toggle, isSelected, error, clearError } = useContentPreferences();

  return (
    <GlassCard style={styles.card} intensity={56}>
      <Text style={[styles.cardTitle, { color: theme.textPrimary }]}>
        {t('settings.content_preferences.title')}
      </Text>
      <Text style={[styles.hint, { color: theme.textSecondary }]}>
        {t('settings.content_preferences.subtitle')}
      </Text>
      {error ? (
        <Pressable
          onPress={clearError}
          accessibilityRole="button"
          accessibilityLabel={t('common.dismiss')}
          style={[styles.errorBanner, { borderColor: theme.error }]}
        >
          <Text style={[styles.errorText, { color: theme.error }]}>{error}</Text>
        </Pressable>
      ) : null}
      {CONTENT_PREFERENCES.map((preference) => (
        <PreferenceRow
          key={preference}
          preference={preference}
          selected={isSelected(preference)}
          isSaving={isSaving}
          onToggle={toggle}
          theme={theme}
          label={t(`settings.content_preferences.options.${preference}.label`)}
          hint={t(`settings.content_preferences.options.${preference}.hint`)}
        />
      ))}
    </GlassCard>
  );
};

interface PreferenceRowProps {
  preference: ContentPreference;
  selected: boolean;
  isSaving: boolean;
  onToggle: (p: ContentPreference) => Promise<void>;
  theme: ReturnType<typeof useTheme>['theme'];
  label: string;
  hint: string;
}

/** Single toggle row for one content preference. Extracted to keep render logic flat. */
const PreferenceRow = ({
  preference,
  selected,
  isSaving,
  onToggle,
  theme,
  label,
  hint,
}: PreferenceRowProps) => {
  return (
    <View style={styles.row}>
      <View style={styles.info}>
        <Text style={[styles.label, { color: theme.textPrimary }]}>{label}</Text>
        <Text style={[styles.optionHint, { color: theme.textSecondary }]}>{hint}</Text>
      </View>
      {isSaving ? (
        <ActivityIndicator color={theme.primary} />
      ) : (
        <Switch
          value={selected}
          onValueChange={() => void onToggle(preference)}
          trackColor={{ false: theme.cardBorder, true: theme.primary }}
          accessibilityLabel={label}
        />
      )}
    </View>
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
  hint: {
    fontSize: semantic.card.captionSize,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  info: {
    flex: 1,
    gap: space['0.5'],
    paddingRight: space['3'],
  },
  label: {
    fontWeight: '600',
    fontSize: semantic.card.bodySize,
  },
  optionHint: {
    fontSize: semantic.card.captionSize,
  },
  errorBanner: {
    borderWidth: 1,
    borderRadius: semantic.button.radiusSmall,
    paddingVertical: space['1.5'],
    paddingHorizontal: space['2'],
  },
  errorText: {
    fontSize: semantic.card.captionSize,
    fontWeight: '600',
  },
});
