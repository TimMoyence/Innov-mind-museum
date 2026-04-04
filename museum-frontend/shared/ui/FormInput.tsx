import { StyleSheet, TextInput, View } from 'react-native';
import type { KeyboardTypeOptions, TextInputProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

import { useTheme } from '@/shared/ui/ThemeContext';

type IoniconsName = ComponentProps<typeof Ionicons>['name'];

interface FormInputProps {
  /** Ionicons icon name displayed before the input. */
  icon: IoniconsName;
  /** Placeholder text shown when the input is empty. */
  placeholder: string;
  /** Current value of the input. */
  value: string;
  /** Callback fired when the text changes. */
  onChangeText: (text: string) => void;
  /** Whether to hide the input text (for passwords). */
  secureTextEntry?: boolean;
  /** Controls auto-capitalization behavior. */
  autoCapitalize?: TextInputProps['autoCapitalize'];
  /** Keyboard type to display. */
  keyboardType?: KeyboardTypeOptions;
  /** Test ID for testing frameworks. */
  testID?: string;
  /** Accessibility label; defaults to placeholder if not provided. */
  accessibilityLabel?: string;
}

/** Themed text input with a leading icon, used for form fields like email, password, and name inputs. */
export function FormInput({
  icon,
  placeholder,
  value,
  onChangeText,
  secureTextEntry,
  autoCapitalize,
  keyboardType,
  testID,
  accessibilityLabel,
}: FormInputProps) {
  const { theme } = useTheme();

  return (
    <View
      style={[
        styles.inputShell,
        { borderColor: theme.cardBorder, backgroundColor: theme.inputBackground },
      ]}
    >
      <Ionicons name={icon} size={20} color={theme.textSecondary} />
      <TextInput
        style={[styles.input, { color: theme.textPrimary }]}
        placeholder={placeholder}
        placeholderTextColor={theme.placeholderText}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secureTextEntry}
        autoCapitalize={autoCapitalize}
        keyboardType={keyboardType}
        testID={testID}
        accessibilityLabel={accessibilityLabel ?? placeholder}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  inputShell: {
    borderRadius: 14,
    borderWidth: 1,
    minHeight: 50,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  input: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 8,
  },
});
