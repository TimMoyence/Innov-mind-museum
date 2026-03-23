import { StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

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

  return (
    <View style={styles.container}>
      <Ionicons name="search-outline" size={16} color="#64748B" style={styles.icon} />
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder ?? t('conversationSearch.placeholder')}
        placeholderTextColor="#94A3B8"
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
    borderColor: 'rgba(148,163,184,0.42)',
    backgroundColor: 'rgba(255,255,255,0.68)',
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
    color: '#0F172A',
  },
});
