import { useState, type ReactElement } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { mfaService } from '@/features/auth/infrastructure/mfaApi';

import type { components } from '@/shared/api/generated/openapi';
import {
  fontSize,
  primaryScale,
  semantic,
  space,
  statusColors,
  surfaceColors,
} from '@/shared/ui/tokens';

type AuthSession = components['schemas']['AuthSessionResponse'];

/**
 * R16 — second-factor screen reached after `/auth/login` returns
 * `mfaRequired: true`. Lets the user submit a 6-digit TOTP code OR fall back
 * to a single-use recovery code. On success, the parent reuses the returned
 * `AuthSessionResponse` to populate the in-memory token store as if a normal
 * login had completed.
 */
export interface MfaChallengeScreenProps {
  /** Bearer issued by `/auth/login` — opaque to this screen. */
  mfaSessionToken: string;
  /** Callback fed the JWT pair on success. */
  onSuccess: (session: AuthSession) => void;
}

export function MfaChallengeScreen({
  mfaSessionToken,
  onSuccess,
}: MfaChallengeScreenProps): ReactElement {
  const [mode, setMode] = useState<'totp' | 'recovery'>('totp');
  const [value, setValue] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (): Promise<void> => {
    setPending(true);
    setError(null);
    try {
      const session =
        mode === 'totp'
          ? await mfaService.challenge(mfaSessionToken, value.trim())
          : await mfaService.recovery(mfaSessionToken, value.trim());
      // Strip the recovery-extra field; consumer expects pure AuthSession.
      const { remainingRecoveryCodes: _ignored, ...authSession } = session as AuthSession & {
        remainingRecoveryCodes?: number;
      };
      onSuccess(authSession);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.title}>Two-factor verification</Text>
      <Text style={styles.subtitle}>
        {mode === 'totp'
          ? 'Enter the 6-digit code from your authenticator app.'
          : 'Enter one of the recovery codes you saved during enrollment.'}
      </Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={setValue}
        keyboardType={mode === 'totp' ? 'number-pad' : 'default'}
        maxLength={mode === 'totp' ? 6 : 32}
        placeholder={mode === 'totp' ? '123456' : 'XXXXX-XXXXX'}
        autoCapitalize="characters"
        accessibilityLabel="MFA code"
      />
      <Pressable
        accessibilityRole="button"
        style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
        onPress={() => {
          void handleSubmit();
        }}
        disabled={pending || value.length === 0}
      >
        {pending ? <ActivityIndicator /> : <Text style={styles.ctaLabel}>Verify</Text>}
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          setMode((prev) => (prev === 'totp' ? 'recovery' : 'totp'));
          setValue('');
          setError(null);
        }}
      >
        <View style={styles.toggleWrap}>
          <Text style={styles.toggleLabel}>
            {mode === 'totp' ? 'Use a recovery code instead' : 'Use authenticator code instead'}
          </Text>
        </View>
      </Pressable>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space['6'], gap: space['4'] },
  title: { fontSize: fontSize['2xl'], fontWeight: '700' },
  subtitle: { fontSize: fontSize.sm, opacity: 0.7 },
  input: {
    borderWidth: 1,
    borderColor: surfaceColors.muted,
    borderRadius: semantic.input.radiusSmall,
    padding: space['3'],
    fontSize: fontSize.lg,
    letterSpacing: 4,
    textAlign: 'center',
  },
  cta: {
    backgroundColor: primaryScale['600'],
    paddingVertical: space['3.5'],
    borderRadius: semantic.button.radius,
    alignItems: 'center',
  },
  ctaPressed: { opacity: 0.85 },
  ctaLabel: { color: surfaceColors.default, fontWeight: '600', fontSize: fontSize.base },
  toggleWrap: { paddingVertical: space['2'] },
  toggleLabel: { color: primaryScale['600'], textAlign: 'center', fontWeight: '600' },
  errorText: { color: statusColors.danger.light, textAlign: 'center' },
});
