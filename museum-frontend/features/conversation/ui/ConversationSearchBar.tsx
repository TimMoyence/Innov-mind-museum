import { StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/shared/ui/ThemeContext';

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
    <View style={[styles.container, { borderColor: theme.cardBorder, backgroundColor: theme.cardBackground }]}>
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
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    marginTop: 12,
  },
  icon: {
    marginEnd: 8,
  },
  input: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 14,
  },
});
