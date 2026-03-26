import { useState } from 'react';
import {
  Alert,
  Linking,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { SUPPORT_LINKS, isValidSupportUrl } from '@/shared/config/supportLinks';
import { FloatingContextMenu } from '@/shared/ui/FloatingContextMenu';
import { GlassCard } from '@/shared/ui/GlassCard';
import { LiquidScreen } from '@/shared/ui/LiquidScreen';
import { pickMuseumBackground } from '@/shared/ui/liquidTheme';
import { useTheme } from '@/shared/ui/ThemeContext';

type SupportChannelKey = keyof typeof SUPPORT_LINKS;

export default function SupportScreen() {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const [status, setStatus] = useState<string | null>(null);

  const openChannel = async (channelKey: SupportChannelKey) => {
    const channel = SUPPORT_LINKS[channelKey];
    if (!isValidSupportUrl(channel.url)) {
      Alert.alert(t('support.invalid_link'), t('support.invalid_link_body', { label: channel.label }));
      return;
    }

    try {
      const supported = await Linking.canOpenURL(channel.url);
      if (!supported) {
        throw new Error('unsupported');
      }

      await Linking.openURL(channel.url);
      setStatus(t('support.channel_opened', { label: channel.label }));
    } catch {
      Alert.alert(
        t('support.unable_open_link'),
        t('support.manual_open', { url: channel.url }),
      );
      setStatus(t('support.channel_failed', { label: channel.label }));
    }
  };

  const shareChannels = async () => {
    await Share.share({
      title: 'Musaium support channels',
      message: [
        'Musaium support channels',
        `${SUPPORT_LINKS.instagram.label}: ${SUPPORT_LINKS.instagram.url}`,
        `${SUPPORT_LINKS.telegram.label}: ${SUPPORT_LINKS.telegram.url}`,
      ].join('\n'),
    });
    setStatus('Support links shared');
  };

  return (
    <LiquidScreen background={pickMuseumBackground(2)} contentStyle={styles.screen}>
      <View style={styles.menuWrap}>
        <FloatingContextMenu
          actions={[
            {
              id: 'instagram',
              icon: 'logo-instagram',
              label: t('support.instagram'),
              onPress: () => void openChannel('instagram'),
            },
            {
              id: 'telegram',
              icon: 'paper-plane-outline',
              label: t('support.telegram'),
              onPress: () => void openChannel('telegram'),
            },
            {
              id: 'privacy',
              icon: 'shield-checkmark-outline',
              label: t('support.privacy'),
              onPress: () => router.push('/(stack)/privacy'),
            },
          ]}
        />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <GlassCard style={styles.heroCard} intensity={60}>
          <Text style={[styles.title, { color: theme.textPrimary }]}>{t('support.title')}</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            {t('support.subtitle')}
          </Text>
          {status ? <Text style={[styles.status, { color: theme.success }]}>{status}</Text> : null}
        </GlassCard>

        <GlassCard style={styles.card} intensity={56}>
          <Text style={[styles.cardTitle, { color: theme.textPrimary }]}>{t('support.instagram')}</Text>
          <Text style={[styles.cardText, { color: theme.textSecondary }]}>Handle: {SUPPORT_LINKS.instagram.handle}</Text>
          <Text style={[styles.cardText, { color: theme.textSecondary }]}>{SUPPORT_LINKS.instagram.url}</Text>
          <Pressable
            style={[styles.primaryButton, { backgroundColor: theme.primary }]}
            onPress={() => void openChannel('instagram')}
            accessibilityRole="link"
            accessibilityLabel={t('a11y.support.instagram')}
          >
            <Text style={[styles.primaryButtonText, { color: theme.primaryContrast }]}>{t('support.open_instagram')}</Text>
          </Pressable>
        </GlassCard>

        <GlassCard style={styles.card} intensity={56}>
          <Text style={[styles.cardTitle, { color: theme.textPrimary }]}>{t('support.telegram')}</Text>
          <Text style={[styles.cardText, { color: theme.textSecondary }]}>Handle: {SUPPORT_LINKS.telegram.handle}</Text>
          <Text style={[styles.cardText, { color: theme.textSecondary }]}>{SUPPORT_LINKS.telegram.url}</Text>
          <Pressable
            style={[styles.secondaryButton, { borderColor: theme.inputBorder, backgroundColor: theme.overlay }]}
            onPress={() => void openChannel('telegram')}
            accessibilityRole="link"
            accessibilityLabel={t('a11y.support.telegram')}
          >
            <Text style={[styles.secondaryButtonText, { color: theme.textPrimary }]}>{t('support.open_telegram')}</Text>
          </Pressable>
        </GlassCard>

        <GlassCard style={styles.card} intensity={52}>
          <Text style={[styles.cardTitle, { color: theme.textPrimary }]}>{t('support.scope_title')}</Text>
          <Text style={[styles.cardText, { color: theme.textSecondary }]}>
            {t('support.scope_topics')}
          </Text>
          <Text style={[styles.cardText, { color: theme.textSecondary }]}>
            {t('support.scope_response')}
          </Text>
          <Text style={[styles.cardText, { color: theme.textSecondary }]}>
            {t('support.scope_team')}
          </Text>
        </GlassCard>

        <Pressable style={[styles.secondaryButton, { borderColor: theme.inputBorder, backgroundColor: theme.overlay }]} onPress={() => void shareChannels()} accessibilityRole="button" accessibilityLabel={t('a11y.support.share')}>
          <Text style={[styles.secondaryButtonText, { color: theme.textPrimary }]}>{t('support.share_channels')}</Text>
        </Pressable>

        <Pressable style={[styles.secondaryButton, { borderColor: theme.inputBorder, backgroundColor: theme.overlay }]} onPress={() => router.push('/(stack)/settings')} accessibilityRole="button" accessibilityLabel={t('a11y.support.back_settings')}>
          <Text style={[styles.secondaryButtonText, { color: theme.textPrimary }]}>{t('support.back_settings')}</Text>
        </Pressable>
      </ScrollView>
    </LiquidScreen>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingTop: 28,
    paddingHorizontal: 18,
    paddingBottom: 14,
  },
  menuWrap: {
    alignItems: 'center',
    marginBottom: 10,
  },
  scrollContent: {
    gap: 12,
    paddingBottom: 20,
  },
  heroCard: {
    padding: 18,
    gap: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
  },
  subtitle: {
    lineHeight: 20,
    fontSize: 14,
  },
  status: {
    fontWeight: '700',
    fontSize: 12,
  },
  card: {
    padding: 16,
    gap: 8,
  },
  cardTitle: {
    fontWeight: '700',
    fontSize: 16,
  },
  cardText: {
    lineHeight: 19,
    fontSize: 13,
  },
  primaryButton: {
    marginTop: 4,
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 12,
  },
  primaryButtonText: {
    fontWeight: '700',
    fontSize: 13,
  },
  secondaryButton: {
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  secondaryButtonText: {
    fontWeight: '700',
    fontSize: 13,
  },
});
