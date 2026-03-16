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

import { SUPPORT_LINKS, isValidSupportUrl } from '@/shared/config/supportLinks';
import { FloatingContextMenu } from '@/shared/ui/FloatingContextMenu';
import { GlassCard } from '@/shared/ui/GlassCard';
import { LiquidScreen } from '@/shared/ui/LiquidScreen';
import { liquidColors, pickMuseumBackground } from '@/shared/ui/liquidTheme';

type SupportChannelKey = keyof typeof SUPPORT_LINKS;

export default function SupportScreen() {
  const [status, setStatus] = useState<string | null>(null);

  const openChannel = async (channelKey: SupportChannelKey) => {
    const channel = SUPPORT_LINKS[channelKey];
    if (!isValidSupportUrl(channel.url)) {
      Alert.alert('Invalid support link', `The ${channel.label} link is not configured correctly.`);
      return;
    }

    try {
      const supported = await Linking.canOpenURL(channel.url);
      if (!supported) {
        throw new Error('unsupported');
      }

      await Linking.openURL(channel.url);
      setStatus(`${channel.label} opened`);
    } catch {
      Alert.alert(
        'Unable to open link',
        `Please open ${channel.url} manually or update the support channel configuration.`,
      );
      setStatus(`${channel.label} link failed`);
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
              label: 'Instagram',
              onPress: () => void openChannel('instagram'),
            },
            {
              id: 'telegram',
              icon: 'paper-plane-outline',
              label: 'Telegram',
              onPress: () => void openChannel('telegram'),
            },
            {
              id: 'privacy',
              icon: 'shield-checkmark-outline',
              label: 'Privacy',
              onPress: () => router.push('/(stack)/privacy'),
            },
          ]}
        />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <GlassCard style={styles.heroCard} intensity={60}>
          <Text style={styles.title}>Support</Text>
          <Text style={styles.subtitle}>
            Contact Musaium support through our social channels. Replace placeholder handles before
            production release.
          </Text>
          {status ? <Text style={styles.status}>{status}</Text> : null}
        </GlassCard>

        <GlassCard style={styles.card} intensity={56}>
          <Text style={styles.cardTitle}>Instagram</Text>
          <Text style={styles.cardText}>Handle: {SUPPORT_LINKS.instagram.handle}</Text>
          <Text style={styles.cardText}>{SUPPORT_LINKS.instagram.url}</Text>
          <Pressable
            style={styles.primaryButton}
            onPress={() => void openChannel('instagram')}
          >
            <Text style={styles.primaryButtonText}>Open Instagram Support</Text>
          </Pressable>
        </GlassCard>

        <GlassCard style={styles.card} intensity={56}>
          <Text style={styles.cardTitle}>Telegram</Text>
          <Text style={styles.cardText}>Handle: {SUPPORT_LINKS.telegram.handle}</Text>
          <Text style={styles.cardText}>{SUPPORT_LINKS.telegram.url}</Text>
          <Pressable
            style={styles.secondaryButton}
            onPress={() => void openChannel('telegram')}
          >
            <Text style={styles.secondaryButtonText}>Open Telegram Support</Text>
          </Pressable>
        </GlassCard>

        <GlassCard style={styles.card} intensity={52}>
          <Text style={styles.cardTitle}>Support Scope</Text>
          <Text style={styles.cardText}>
            Supported topics (placeholder): account access, app bugs, feature feedback, and guided museum
            experience issues.
          </Text>
          <Text style={styles.cardText}>
            Target response time (placeholder): TO_FILL_SUPPORT_RESPONSE_TIME.
          </Text>
          <Text style={styles.cardText}>
            Escalation channel owner (placeholder): TO_FILL_SUPPORT_OWNER.
          </Text>
        </GlassCard>

        <Pressable style={styles.secondaryButton} onPress={() => void shareChannels()}>
          <Text style={styles.secondaryButtonText}>Share Support Channels</Text>
        </Pressable>

        <Pressable style={styles.secondaryButton} onPress={() => router.push('/(stack)/settings')}>
          <Text style={styles.secondaryButtonText}>Back to Settings</Text>
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
    color: liquidColors.textPrimary,
    fontSize: 28,
    fontWeight: '700',
  },
  subtitle: {
    color: liquidColors.textSecondary,
    lineHeight: 20,
    fontSize: 14,
  },
  status: {
    color: '#166534',
    fontWeight: '700',
    fontSize: 12,
  },
  card: {
    padding: 16,
    gap: 8,
  },
  cardTitle: {
    color: liquidColors.textPrimary,
    fontWeight: '700',
    fontSize: 16,
  },
  cardText: {
    color: liquidColors.textSecondary,
    lineHeight: 19,
    fontSize: 13,
  },
  primaryButton: {
    marginTop: 4,
    borderRadius: 12,
    backgroundColor: liquidColors.primary,
    alignItems: 'center',
    paddingVertical: 12,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  secondaryButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.48)',
    backgroundColor: 'rgba(255,255,255,0.70)',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  secondaryButtonText: {
    color: liquidColors.textPrimary,
    fontWeight: '700',
    fontSize: 13,
  },
});
