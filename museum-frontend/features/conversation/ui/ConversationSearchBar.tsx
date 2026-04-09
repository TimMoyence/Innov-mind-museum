import { StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/shared/ui/ThemeContext';
import { semantic, space } from '@/shared/ui/tokens';

interface ConversationSearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
}

/** Search input for filtering conversations by title or subtitle. */
export const ConversationSearchBar = ({
  value,
  onChangeText,
  placeholder,
}: ConversationSearchBarProps) => {
  const { t } = useTranslation();
  const { theme } = useTheme();

  return (
    <View
      style={[
        styles.container,
        { borderColor: theme.cardBorder, backgroundColor: theme.cardBackground },
      ]}
    >
      <Ionicons name="search-outline" size={16} color={theme.placeholderText} style={styles.icon} />
      <TextInput
        style={[styles.input, { color: theme.textPrimary }]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder ?? t('conversationSearch.placeholder')}
        placeholderTextColor={theme.placeholderText}
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="while-editing"
        accessibilityRole="search"
        accessibilityLabel={t('a11y.conversations.search_input')}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: semantic.input.radiusSmall,
    borderWidth: semantic.input.borderWidth,
    paddingHorizontal: semantic.input.paddingCompact,
    marginTop: semantic.section.gap,
  },
  icon: {
    marginEnd: space['2'],
  },
  input: {
    flex: 1,
    paddingVertical: space['2.5'],
    fontSize: semantic.card.bodySize,
  },
});
