import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { GlassCard } from '@/shared/ui/GlassCard';
import { liquidColors } from '@/shared/ui/liquidTheme';

interface WelcomeCardProps {
  museumMode: boolean;
  locale: string;
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

const getEnSuggestions = (museumMode: boolean): Suggestion[] => {
  if (museumMode) {
    return [
      { text: 'What artwork is in front of me?', icon: 'camera-outline', isCamera: true },
      { text: 'Tell me about the history of this museum', icon: 'time-outline' },
      { text: 'What should I see next?', icon: 'compass-outline' },
    ];
  }

  return [
    { text: 'Photograph an artwork to learn about it', icon: 'camera-outline', isCamera: true },
    { text: 'Tell me about Impressionism', icon: 'color-palette-outline' },
    { text: 'Who painted the Mona Lisa?', icon: 'help-circle-outline' },
  ];
};

const getFrSuggestions = (museumMode: boolean): Suggestion[] => {
  if (museumMode) {
    return [
      { text: 'Quelle oeuvre est devant moi ?', icon: 'camera-outline', isCamera: true },
      { text: 'Parlez-moi de l\'histoire de ce musee', icon: 'time-outline' },
      { text: 'Que devrais-je voir ensuite ?', icon: 'compass-outline' },
    ];
  }

  return [
    { text: 'Photographiez une oeuvre pour en savoir plus', icon: 'camera-outline', isCamera: true },
    { text: 'Parlez-moi de l\'Impressionnisme', icon: 'color-palette-outline' },
    { text: 'Qui a peint la Joconde ?', icon: 'help-circle-outline' },
  ];
};

/** Displays a welcome greeting with locale-aware suggestion buttons for starting a conversation or opening the camera. */
export const WelcomeCard = ({ museumMode, locale, onSuggestion, onCamera, disabled = false }: WelcomeCardProps) => {
  const isFrench = locale.toLowerCase().startsWith('fr');
  const suggestions = isFrench ? getFrSuggestions(museumMode) : getEnSuggestions(museumMode);
  const welcomeTitle = isFrench ? 'Bienvenue sur Musaium' : 'Welcome to Musaium';
  const welcomeSubtitle = isFrench
    ? 'Votre compagnon de musee personnel'
    : 'Your personal museum companion';

  return (
    <GlassCard style={styles.card} intensity={48}>
      <Text style={styles.title}>{welcomeTitle}</Text>
      <Text style={styles.subtitle}>{welcomeSubtitle}</Text>
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
          >
            <Ionicons name={suggestion.icon} size={18} color={liquidColors.primary} />
            <Text style={styles.suggestionText} numberOfLines={2}>{suggestion.text}</Text>
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
    color: liquidColors.textPrimary,
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 4,
    fontSize: 14,
    color: '#475569',
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
    color: liquidColors.textPrimary,
    fontSize: 14,
    fontWeight: '500',
  },
  suggestionButtonDisabled: {
    opacity: 0.5,
  },
});
