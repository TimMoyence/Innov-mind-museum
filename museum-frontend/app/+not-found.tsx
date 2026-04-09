import { Link, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text } from 'react-native';

import { GlassCard } from '@/shared/ui/GlassCard';
import { LiquidScreen } from '@/shared/ui/LiquidScreen';
import { pickMuseumBackground } from '@/shared/ui/liquidTheme';
import { useTheme } from '@/shared/ui/ThemeContext';
import { semantic, space } from '@/shared/ui/tokens';

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
          <Link href="/" asChild>
            <Pressable
              style={[styles.button, { backgroundColor: theme.primary }]}
              accessibilityRole="link"
              accessibilityLabel={t('a11y.notFound.home')}
            >
              <Text style={[styles.buttonText, { color: theme.primaryContrast }]}>
                {t('notFound.button')}
              </Text>
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
    padding: semantic.modal.padding,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    padding: semantic.modal.padding,
    gap: semantic.card.gap,
  },
  title: {
    fontSize: space['5.5'],
    fontWeight: '700',
    textAlign: 'center',
  },
  button: {
    marginTop: semantic.card.gapTiny,
    borderRadius: semantic.card.radiusCompact,
    paddingVertical: semantic.button.paddingY,
    alignItems: 'center',
  },
  buttonText: {
    fontSize: semantic.button.fontSize,
    fontWeight: '700',
  },
});
