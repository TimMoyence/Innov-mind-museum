import { StyleSheet, Text, TextInput, View } from 'react-native';
import type { KeyboardTypeOptions, TextInputProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

import { useTheme } from '@/shared/ui/ThemeContext';
import { semantic, space } from './tokens';

type IoniconsName = ComponentProps<typeof Ionicons>['name'];

export type FormInputVariant = 'text' | 'email' | 'password' | 'password-new';

interface VariantDefaults {
  secureTextEntry: boolean;
  autoCapitalize: TextInputProps['autoCapitalize'];
  keyboardType: KeyboardTypeOptions;
  autoComplete: TextInputProps['autoComplete'];
  textContentType: TextInputProps['textContentType'];
}

const VARIANT_DEFAULTS: Record<FormInputVariant, VariantDefaults> = {
  text: {
    secureTextEntry: false,
    autoCapitalize: 'sentences',
    keyboardType: 'default',
    autoComplete: 'off',
    textContentType: 'none',
  },
  email: {
    secureTextEntry: false,
    autoCapitalize: 'none',
    keyboardType: 'email-address',
    autoComplete: 'email',
    textContentType: 'emailAddress',
  },
  password: {
    secureTextEntry: true,
    autoCapitalize: 'none',
    keyboardType: 'default',
    autoComplete: 'current-password',
    textContentType: 'password',
  },
  'password-new': {
    secureTextEntry: true,
    autoCapitalize: 'none',
    keyboardType: 'default',
    autoComplete: 'new-password',
    textContentType: 'newPassword',
  },
};

interface FormInputProps {
  icon: IoniconsName;
  placeholder: string;
  value: string;
  onChangeText: (text: string) => void;
  variant?: FormInputVariant;
  secureTextEntry?: boolean;
  autoCapitalize?: TextInputProps['autoCapitalize'];
  keyboardType?: KeyboardTypeOptions;
  autoComplete?: TextInputProps['autoComplete'];
  textContentType?: TextInputProps['textContentType'];
  testID?: string;
  accessibilityLabel?: string;
  onBlur?: TextInputProps['onBlur'];
  error?: string;
  errorTestID?: string;
}

export function FormInput({
  icon,
  placeholder,
  value,
  onChangeText,
  variant = 'text',
  secureTextEntry,
  autoCapitalize,
  keyboardType,
  autoComplete,
  textContentType,
  testID,
  accessibilityLabel,
  onBlur,
  error,
  errorTestID,
}: FormInputProps) {
  const { theme } = useTheme();
  const defaults = VARIANT_DEFAULTS[variant];

  const shellBorderColor = error ? theme.danger : theme.cardBorder;
  const resolvedErrorTestID = errorTestID ?? (testID ? `${testID}-error` : undefined);

  return (
    <View style={styles.wrapper}>
      <View
        style={[
          styles.inputShell,
          { borderColor: shellBorderColor, backgroundColor: theme.inputBackground },
        ]}
      >
        <Ionicons name={icon} size={20} color={theme.textSecondary} />
        <TextInput
          style={[styles.input, { color: theme.textPrimary }]}
          placeholder={placeholder}
          placeholderTextColor={theme.placeholderText}
          value={value}
          onChangeText={onChangeText}
          onBlur={onBlur}
          secureTextEntry={secureTextEntry ?? defaults.secureTextEntry}
          autoCapitalize={autoCapitalize ?? defaults.autoCapitalize}
          keyboardType={keyboardType ?? defaults.keyboardType}
          autoComplete={autoComplete ?? defaults.autoComplete}
          textContentType={textContentType ?? defaults.textContentType}
          testID={testID}
          accessibilityLabel={accessibilityLabel ?? placeholder}
        />
      </View>
      {error ? (
        <Text
          testID={resolvedErrorTestID}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          style={[styles.errorText, { color: theme.danger }]}
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: space['1'],
  },
  inputShell: {
    borderRadius: semantic.input.radius,
    borderWidth: semantic.input.borderWidth,
    minHeight: semantic.button.heightApple,
    paddingHorizontal: semantic.input.paddingCompact,
    flexDirection: 'row',
    alignItems: 'center',
    gap: semantic.card.gapSmall,
  },
  input: {
    flex: 1,
    fontSize: 15,
    paddingVertical: space['2'],
  },
  errorText: {
    fontSize: 13,
    paddingHorizontal: space['1'],
  },
});
