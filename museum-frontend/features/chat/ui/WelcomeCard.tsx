import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { GlassCard } from '@/shared/ui/GlassCard';
import { useTheme } from '@/shared/ui/ThemeContext';

interface WelcomeCardProps {
  museumMode: boolean;
  onSuggestion: (text: string) => void;
  onCamera: () => void;
  /** When true, all suggestion buttons are disabled (e.g. during an active send). */
  disabled?: boolean;
}

interface Suggestion {
  text: string;
  icon: keyof typeof Ionicons.glyphMap;
  isCamera?: boolean;
}

/** Displays a welcome greeting with suggestion buttons for starting a conversation or opening the camera. */
export const WelcomeCard = ({ museumMode, onSuggestion, onCamera, disabled = false }: WelcomeCardProps) => {
  const { theme } = useTheme();
  const { t } = useTranslation();

  const suggestions: Suggestion[] = museumMode
    ? [
        { text: t('welcome.suggestions.museum_camera'), icon: 'camera-outline', isCamera: true },
        { text: t('welcome.suggestions.museum_history'), icon: 'time-outline' },
        { text: t('welcome.suggestions.museum_next'), icon: 'compass-outline' },
      ]
    : [
        { text: t('welcome.suggestions.standard_camera'), icon: 'camera-outline', isCamera: true },
        { text: t('welcome.suggestions.standard_style'), icon: 'color-palette-outline' },
        { text: t('welcome.suggestions.standard_question'), icon: 'help-circle-outline' },
      ];

  return (
    <GlassCard style={styles.card} intensity={48}>
      <Text style={[styles.title, { color: theme.textPrimary }]}>{t('welcome.title')}</Text>
      <Text style={[styles.subtitle, { color: theme.textTertiary }]}>{t('welcome.subtitle')}</Text>
      <View style={styles.suggestions}>
        {suggestions.map((suggestion) => (
          <Pressable
            key={suggestion.text}
            style={[styles.suggestionButton, disabled && styles.suggestionButtonDisabled]}
            onPress={() => {
              if (suggestion.isCamera) {
                onCamera();
              } else {
                onSuggestion(suggestion.text);
              }
            }}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={suggestion.text}
            accessibilityHint={suggestion.isCamera ? t('a11y.chat.camera_suggestion_hint') : t('a11y.chat.suggestion_hint')}
          >
            <Ionicons name={suggestion.icon} size={18} color={theme.primary} />
            <Text style={[styles.suggestionText, { color: theme.textPrimary }]} numberOfLines={2}>{suggestion.text}</Text>
          </Pressable>
        ))}
      </View>
    </GlassCard>
  );
};

const styles = StyleSheet.create({
  card: {
    padding: 20,
    marginHorizontal: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 4,
    fontSize: 14,
    textAlign: 'center',
  },
  suggestions: {
    marginTop: 16,
    gap: 10,
  },
  suggestionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.35)',
    backgroundColor: 'rgba(255,255,255,0.6)',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  suggestionText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
  },
  suggestionButtonDisabled: {
    opacity: 0.5,
  },
});
