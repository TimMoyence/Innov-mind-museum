import { Link, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { GlassCard } from '@/shared/ui/GlassCard';
import { LiquidScreen } from '@/shared/ui/LiquidScreen';
import { pickMuseumBackground } from '@/shared/ui/liquidTheme';
import { useTheme } from '@/shared/ui/ThemeContext';

/** Displays a 404-style screen with a link to navigate back to the home page. */
export default function NotFoundScreen() {
  const { theme } = useTheme();
  const { t } = useTranslation();

  return (
    <>
      <Stack.Screen options={{ title: t('notFound.screen_title') }} />
      <LiquidScreen background={pickMuseumBackground(2)} contentStyle={styles.screen}>
        <GlassCard style={styles.card} intensity={60}>
          <Text style={[styles.title, { color: theme.textPrimary }]}>{t('notFound.title')}</Text>
          <Link href='/' asChild>
            <Pressable
              style={[styles.button, { backgroundColor: theme.primary }]}
              accessibilityRole="link"
              accessibilityLabel={t('a11y.notFound.home')}
            >
              <Text style={[styles.buttonText, { color: theme.primaryContrast }]}>{t('notFound.button')}</Text>
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
    textAlign: 'center',
  },
  button: {
    marginTop: 4,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '700',
  },
});
