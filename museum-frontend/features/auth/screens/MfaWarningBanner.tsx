import type { ReactElement } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { fontSize, semantic, space, statusColors, surfaceColors } from '@/shared/ui/tokens';

/**
 * R16 — banner rendered above the admin shell when an admin is still inside
 * the 30-day MFA warning window. Shows the days remaining and a CTA that
 * routes the user to the enrollment screen.
 *
 * Drives a single, focused message — the rest of the admin UX stays
 * unchanged so the warning never blocks legitimate work in the window.
 */
export interface MfaWarningBannerProps {
  /** Days left before the soft block kicks in. */
  daysRemaining: number;
  /** Press handler — typically pushes the MfaEnrollScreen. */
  onEnrollPress: () => void;
}

export function MfaWarningBanner({
  daysRemaining,
  onEnrollPress,
}: MfaWarningBannerProps): ReactElement {
  const label =
    daysRemaining > 1
      ? `Two-factor authentication required in ${String(daysRemaining)} days`
      : daysRemaining === 1
        ? 'Two-factor authentication required in 1 day'
        : 'Two-factor authentication required today';

  return (
    <View style={styles.root} accessibilityRole="alert">
      <View style={styles.body}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.hint}>
          Enroll now to keep accessing the admin tools after the deadline.
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={onEnrollPress}
        style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
      >
        <Text style={styles.ctaLabel}>Enroll now</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    backgroundColor: statusColors.warningBg.light,
    borderColor: statusColors.warning.light,
    borderWidth: 1,
    borderRadius: semantic.badge.radius,
    padding: space['3'],
    gap: space['3'],
    alignItems: 'center',
  },
  body: { flex: 1, gap: space['1'] },
  label: { fontWeight: '700', color: statusColors.warning.light },
  hint: { fontSize: fontSize.xs, color: statusColors.warning.light },
  cta: {
    backgroundColor: statusColors.warning.light,
    paddingHorizontal: space['3'],
    paddingVertical: space['2'],
    borderRadius: semantic.badge.radius,
  },
  ctaPressed: { opacity: 0.85 },
  ctaLabel: { color: surfaceColors.default, fontWeight: '700' },
});
