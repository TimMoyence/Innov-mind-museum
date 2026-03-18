import { Link, Stack } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { GlassCard } from '@/shared/ui/GlassCard';
import { LiquidScreen } from '@/shared/ui/LiquidScreen';
import { liquidColors, pickMuseumBackground } from '@/shared/ui/liquidTheme';

/** Displays a 404-style screen with a link to navigate back to the home page. */
export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Oops' }} />
      <LiquidScreen background={pickMuseumBackground(2)} contentStyle={styles.screen}>
        <GlassCard style={styles.card} intensity={60}>
          <Text style={styles.title}>This screen does not exist</Text>
          <Link href='/' asChild>
            <Pressable style={styles.button}>
              <Text style={styles.buttonText}>Go to Home</Text>
            </Pressable>
          </Link>
        </GlassCard>
      </LiquidScreen>
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    padding: 20,
    gap: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: liquidColors.textPrimary,
    textAlign: 'center',
  },
  button: {
    marginTop: 4,
    backgroundColor: liquidColors.primary,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
