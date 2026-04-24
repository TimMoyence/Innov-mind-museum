import { StyleSheet, TextInput, View } from 'react-native';
import type { KeyboardTypeOptions, TextInputProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

import { useTheme } from '@/shared/ui/ThemeContext';
import { semantic, space } from './tokens';

type IoniconsName = ComponentProps<typeof Ionicons>['name'];

/**
 * Semantic role of the input. Drives password-manager hints on iOS and
 * autofill plumbing on Android so the system keychain can suggest / save
 * credentials correctly:
 *
 *   - text          — generic free-form (default)
 *   - email         — email address, lowercase keyboard
 *   - password      — existing password (sign-in flows)
 *   - password-new  — new password (registration, reset)
 *
 * Note: RN `autoComplete` is Android-focused and `textContentType` is iOS-only;
 * both are derived from the variant so callers opt into the right semantics
 * without thinking about platform quirks.
 */
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
  /** Ionicons icon name displayed before the input. */
  icon: IoniconsName;
  /** Placeholder text shown when the input is empty. */
  placeholder: string;
  /** Current value of the input. */
  value: string;
  /** Callback fired when the text changes. */
  onChangeText: (text: string) => void;
  /**
   * Semantic variant — drives secureTextEntry, autoCapitalize, keyboardType,
   * autoComplete, and textContentType defaults. Defaults to `'text'`.
   */
  variant?: FormInputVariant;
  /**
   * Overrides the variant-derived `secureTextEntry`. Rarely needed — prefer
   * `variant="password"` or `variant="password-new"`.
   */
  secureTextEntry?: boolean;
  /** Overrides the variant-derived auto-capitalization. */
  autoCapitalize?: TextInputProps['autoCapitalize'];
  /** Overrides the variant-derived keyboard type. */
  keyboardType?: KeyboardTypeOptions;
  /** Overrides the variant-derived Android autofill hint. */
  autoComplete?: TextInputProps['autoComplete'];
  /** Overrides the variant-derived iOS password-manager hint. */
  textContentType?: TextInputProps['textContentType'];
  /** Test ID for testing frameworks. */
  testID?: string;
  /** Accessibility label; defaults to placeholder if not provided. */
  accessibilityLabel?: string;
}

/**
 * Themed text input with a leading icon, used for form fields like email,
 * password, and name inputs. Pass `variant` to get password-manager / autofill
 * defaults wired for you; individual props can still override the variant.
 */
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
}: FormInputProps) {
  const { theme } = useTheme();
  const defaults = VARIANT_DEFAULTS[variant];

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
        secureTextEntry={secureTextEntry ?? defaults.secureTextEntry}
        autoCapitalize={autoCapitalize ?? defaults.autoCapitalize}
        keyboardType={keyboardType ?? defaults.keyboardType}
        autoComplete={autoComplete ?? defaults.autoComplete}
        textContentType={textContentType ?? defaults.textContentType}
        testID={testID}
        accessibilityLabel={accessibilityLabel ?? placeholder}
      />
    </View>
  );
}

const styles = StyleSheet.create({
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
});
