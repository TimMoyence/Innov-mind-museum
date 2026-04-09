import { useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import {
  SUPPORT_LINKS,
  getReadySupportChannels,
  isValidSupportUrl,
  type SupportChannelKey,
} from '@/shared/config/supportLinks';
import { semantic } from '@/shared/ui/tokens.semantic';
import { space, fontSize } from '@/shared/ui/tokens.generated';
import { FloatingContextMenu, type ContextMenuAction } from '@/shared/ui/FloatingContextMenu';
import { GlassCard } from '@/shared/ui/GlassCard';
import { LiquidScreen } from '@/shared/ui/LiquidScreen';
import { pickMuseumBackground } from '@/shared/ui/liquidTheme';
import { useTheme } from '@/shared/ui/ThemeContext';

const supportChannelIcon: Record<SupportChannelKey, ContextMenuAction['icon']> = {
  instagram: 'logo-instagram',
  telegram: 'paper-plane-outline',
};

export default function SupportScreen() {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const [status, setStatus] = useState<string | null>(null);
  const readyChannels = getReadySupportChannels();

  const openChannel = async (channelKey: SupportChannelKey) => {
    const channel = SUPPORT_LINKS[channelKey];
    if (!isValidSupportUrl(channel.url)) {
      Alert.alert(
        t('support.invalid_link'),
        t('support.invalid_link_body', { label: channel.label }),
      );
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
      Alert.alert(t('support.unable_open_link'), t('support.manual_open', { url: channel.url }));
      setStatus(t('support.channel_failed', { label: channel.label }));
    }
  };

  const shareChannels = async () => {
    const channelLines = readyChannels.map(([, channel]) => `${channel.label}: ${channel.url}`);
    await Share.share({
      title: 'Musaium support channels',
      message: ['Musaium support channels', ...channelLines].join('\n'),
    });
    setStatus(t('support.links_shared'));
  };

  const menuActions: ContextMenuAction[] = [
    ...readyChannels.map(([channelKey]) => ({
      id: channelKey,
      icon: supportChannelIcon[channelKey],
      label: channelKey === 'instagram' ? t('support.instagram') : t('support.telegram'),
      onPress: () => void openChannel(channelKey),
    })),
    {
      id: 'privacy',
      icon: 'shield-checkmark-outline',
      label: t('support.privacy'),
      onPress: () => {
        router.push('/(stack)/privacy');
      },
    },
  ];

  return (
    <LiquidScreen background={pickMuseumBackground(2)} contentStyle={styles.screen}>
      <View style={styles.menuWrap}>
        <FloatingContextMenu actions={menuActions} />
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
          <Text style={[styles.cardTitle, { color: theme.textPrimary }]}>
            {t('tickets.myTickets')}
          </Text>
          <Text style={[styles.cardText, { color: theme.textSecondary }]}>
            {t('tickets.noTicketsDesc')}
          </Text>
          <Pressable
            style={[styles.primaryButton, { backgroundColor: theme.primary }]}
            onPress={() => {
              router.push('/(stack)/tickets');
            }}
            accessibilityRole="button"
            accessibilityLabel={t('tickets.myTickets')}
          >
            <Text style={[styles.primaryButtonText, { color: theme.primaryContrast }]}>
              {t('tickets.myTickets')}
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.secondaryButton,
              { borderColor: theme.inputBorder, backgroundColor: theme.overlay },
            ]}
            onPress={() => {
              router.push('/(stack)/create-ticket');
            }}
            accessibilityRole="button"
            accessibilityLabel={t('tickets.createTicket')}
          >
            <Text style={[styles.secondaryButtonText, { color: theme.textPrimary }]}>
              {t('tickets.createTicket')}
            </Text>
          </Pressable>
        </GlassCard>

        {readyChannels.map(([channelKey, channel]) => {
          const openLabel =
            channelKey === 'instagram' ? t('support.open_instagram') : t('support.open_telegram');
          const a11yLabel =
            channelKey === 'instagram' ? t('a11y.support.instagram') : t('a11y.support.telegram');
          return (
            <GlassCard key={channelKey} style={styles.card} intensity={56}>
              <Text style={[styles.cardTitle, { color: theme.textPrimary }]}>
                {channelKey === 'instagram' ? t('support.instagram') : t('support.telegram')}
              </Text>
              <Text style={[styles.cardText, { color: theme.textSecondary }]}>
                Handle: {channel.handle}
              </Text>
              <Text style={[styles.cardText, { color: theme.textSecondary }]}>{channel.url}</Text>
              <Pressable
                style={
                  channelKey === 'instagram'
                    ? [styles.primaryButton, { backgroundColor: theme.primary }]
                    : [
                        styles.secondaryButton,
                        { borderColor: theme.inputBorder, backgroundColor: theme.overlay },
                      ]
                }
                onPress={() => void openChannel(channelKey)}
                accessibilityRole="link"
                accessibilityLabel={a11yLabel}
              >
                <Text
                  style={
                    channelKey === 'instagram'
                      ? [styles.primaryButtonText, { color: theme.primaryContrast }]
                      : [styles.secondaryButtonText, { color: theme.textPrimary }]
                  }
                >
                  {openLabel}
                </Text>
              </Pressable>
            </GlassCard>
          );
        })}

        <GlassCard style={styles.card} intensity={52}>
          <Text style={[styles.cardTitle, { color: theme.textPrimary }]}>
            {t('support.scope_title')}
          </Text>
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

        <Pressable
          style={[
            styles.secondaryButton,
            { borderColor: theme.inputBorder, backgroundColor: theme.overlay },
          ]}
          onPress={() => void shareChannels()}
          accessibilityRole="button"
          accessibilityLabel={t('a11y.support.share')}
          disabled={readyChannels.length === 0}
        >
          <Text style={[styles.secondaryButtonText, { color: theme.textPrimary }]}>
            {t('support.share_channels')}
          </Text>
        </Pressable>

        <Pressable
          style={[
            styles.secondaryButton,
            { borderColor: theme.inputBorder, backgroundColor: theme.overlay },
          ]}
          onPress={() => {
            router.push('/(stack)/settings');
          }}
          accessibilityRole="button"
          accessibilityLabel={t('a11y.support.back_settings')}
        >
          <Text style={[styles.secondaryButtonText, { color: theme.textPrimary }]}>
            {t('support.back_settings')}
          </Text>
        </Pressable>
      </ScrollView>
    </LiquidScreen>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingTop: semantic.screen.paddingXL,
    paddingHorizontal: space['4.5'],
    paddingBottom: semantic.form.gapLarge,
  },
  menuWrap: {
    alignItems: 'center',
    marginBottom: space['2.5'],
  },
  scrollContent: {
    gap: semantic.screen.gapSmall,
    paddingBottom: space['5'],
  },
  heroCard: {
    padding: semantic.card.paddingLarge,
    gap: semantic.card.gapSmall,
  },
  title: {
    fontSize: semantic.section.titleSizeHero,
    fontWeight: '700',
  },
  subtitle: {
    lineHeight: space['5'],
    fontSize: fontSize.sm,
  },
  status: {
    fontWeight: '700',
    fontSize: semantic.card.captionSize,
  },
  card: {
    padding: semantic.card.padding,
    gap: semantic.card.gapSmall,
  },
  cardTitle: {
    fontWeight: '700',
    fontSize: semantic.section.subtitleSize,
  },
  cardText: {
    lineHeight: 19,
    fontSize: semantic.form.labelSize,
  },
  primaryButton: {
    marginTop: space['1'],
    borderRadius: semantic.button.radiusSmall,
    alignItems: 'center',
    paddingVertical: semantic.button.paddingY,
  },
  primaryButtonText: {
    fontWeight: '700',
    fontSize: semantic.form.labelSize,
  },
  secondaryButton: {
    borderRadius: semantic.button.radiusSmall,
    borderWidth: semantic.input.borderWidth,
    alignItems: 'center',
    paddingVertical: semantic.button.paddingY,
    paddingHorizontal: semantic.input.paddingCompact,
  },
  secondaryButtonText: {
    fontWeight: '700',
    fontSize: semantic.form.labelSize,
  },
});
