import * as Clipboard from 'expo-clipboard';
import { useState, type ReactElement } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { mfaService } from '@/features/auth/infrastructure/mfaApi';
import {
  fontSize,
  goldScale,
  primaryScale,
  semantic,
  space,
  statusColors,
  surfaceColors,
} from '@/shared/ui/tokens';

/**
 * R16 — TOTP enrollment screen.
 *
 * Three-step UI:
 *   1. Press "Generate" → POST /auth/mfa/enroll → render QR + manual key + 10
 *      recovery codes with an explicit "Save these now" warning.
 *   2. Type 6-digit code into the input + press "Verify" → POST
 *      /auth/mfa/enroll/verify.
 *   3. On success, the parent screen navigates the user back into the admin
 *      flow — surfaced via the optional `onEnrolled` prop.
 *
 * Recovery codes are shown ONCE; the backend bcrypt-hashes them on persist
 * so they cannot be re-fetched. The `Copy all` button stresses persistence.
 */
export interface MfaEnrollScreenProps {
  /** Callback invoked once `verifyEnrollment` succeeds. */
  onEnrolled?: () => void;
}

export function MfaEnrollScreen({ onEnrolled }: MfaEnrollScreenProps): ReactElement {
  const [otpauthUrl, setOtpauthUrl] = useState<string | null>(null);
  const [manualSecret, setManualSecret] = useState<string | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [code, setCode] = useState('');
  const [pending, setPending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async (): Promise<void> => {
    setPending(true);
    setError(null);
    try {
      const result = await mfaService.enroll();
      setOtpauthUrl(result.otpauthUrl);
      setManualSecret(result.manualSecret);
      setRecoveryCodes(result.recoveryCodes);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(false);
    }
  };

  const handleVerify = async (): Promise<void> => {
    setVerifying(true);
    setError(null);
    try {
      await mfaService.verifyEnrollment(code.trim());
      onEnrolled?.();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setVerifying(false);
    }
  };

  const handleCopyCodes = async (): Promise<void> => {
    await Clipboard.setStringAsync(recoveryCodes.join('\n'));
    Alert.alert('Copied', 'Recovery codes copied to clipboard.');
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Set up two-factor authentication</Text>
      <Text style={styles.subtitle}>
        Scan the QR with Google Authenticator, 1Password, or any TOTP app.
      </Text>

      {!otpauthUrl ? (
        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
          onPress={() => {
            void handleGenerate();
          }}
          disabled={pending}
        >
          {pending ? <ActivityIndicator /> : <Text style={styles.ctaLabel}>Generate</Text>}
        </Pressable>
      ) : (
        <View style={styles.qrWrap}>
          <QRCode value={otpauthUrl} size={200} />
          <Text style={styles.manualHint}>Or enter this key manually:</Text>
          <Text selectable style={styles.manualKey}>
            {manualSecret}
          </Text>
        </View>
      )}

      {recoveryCodes.length > 0 && (
        <View style={styles.codesBlock}>
          <Text style={styles.codesTitle}>Recovery codes</Text>
          <Text style={styles.codesWarning}>
            Save these now. Each can be used once if you lose access to your authenticator. We
            cannot show them again.
          </Text>
          {recoveryCodes.map((c) => (
            <Text key={c} selectable style={styles.codeLine}>
              {c}
            </Text>
          ))}
          <Pressable
            accessibilityRole="button"
            style={styles.copyBtn}
            onPress={() => {
              void handleCopyCodes();
            }}
          >
            <Text style={styles.copyBtnLabel}>Copy all</Text>
          </Pressable>
        </View>
      )}

      {otpauthUrl ? (
        <View style={styles.verifyBlock}>
          <Text style={styles.verifyLabel}>Enter the 6-digit code</Text>
          <TextInput
            style={styles.input}
            keyboardType="number-pad"
            maxLength={6}
            value={code}
            onChangeText={setCode}
            placeholder="123456"
            accessibilityLabel="TOTP code"
          />
          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
            onPress={() => {
              void handleVerify();
            }}
            disabled={verifying || code.length !== 6}
          >
            {verifying ? <ActivityIndicator /> : <Text style={styles.ctaLabel}>Verify</Text>}
          </Pressable>
        </View>
      ) : null}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: space['6'], gap: space['4'] },
  title: { fontSize: fontSize['2xl'], fontWeight: '700' },
  subtitle: { fontSize: fontSize.sm, opacity: 0.7 },
  cta: {
    backgroundColor: primaryScale['600'],
    paddingVertical: space['3.5'],
    borderRadius: semantic.button.radius,
    alignItems: 'center',
  },
  ctaPressed: { opacity: 0.85 },
  ctaLabel: { color: surfaceColors.default, fontWeight: '600', fontSize: fontSize.base },
  qrWrap: { alignItems: 'center', gap: space['2'], paddingVertical: space['3'] },
  manualHint: { fontSize: fontSize['sm-'], marginTop: space['2'] },
  manualKey: { fontFamily: 'Courier', fontSize: fontSize.sm, letterSpacing: 1 },
  codesBlock: {
    backgroundColor: statusColors.warningBg.light,
    padding: space['4'],
    borderRadius: semantic.card.radiusCompact,
    gap: space['1.5'],
  },
  codesTitle: { fontWeight: '700', fontSize: fontSize.base },
  codesWarning: { fontSize: fontSize['sm-'], color: statusColors.warning.light },
  codeLine: { fontFamily: 'Courier', fontSize: fontSize.sm, letterSpacing: 1 },
  copyBtn: {
    marginTop: space['2'],
    paddingVertical: space['2'],
    borderRadius: semantic.badge.radius,
    backgroundColor: goldScale['400'],
    alignItems: 'center',
  },
  copyBtnLabel: { fontWeight: '600' },
  verifyBlock: { gap: space['3'] },
  verifyLabel: { fontSize: fontSize.sm, fontWeight: '600' },
  input: {
    borderWidth: 1,
    borderColor: surfaceColors.muted,
    borderRadius: semantic.input.radiusSmall,
    padding: space['3'],
    fontSize: fontSize.lg,
    letterSpacing: 4,
    textAlign: 'center',
  },
  errorText: { color: statusColors.danger.light },
});
