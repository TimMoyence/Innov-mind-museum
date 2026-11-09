import React, { useEffect } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { artworkLocation } from '@/features/chat/ui/ArtworkCard';
import { useTheme } from '@/shared/ui/ThemeContext';
import { fontSize, semantic, space } from '@/shared/ui/tokens';

import type { ArtworkHeroModel } from '@/features/chat/application/useArtworkHero';
import { useCarnetImageSource } from '@/features/chat/application/useCarnetImageSource';

interface ArtworkHeroCardProps {
  readonly model: ArtworkHeroModel | null;
  readonly collapsed?: boolean;
  readonly onExpand?: () => void;
}

const THUMB_EXPANDED = 56;
const THUMB_COLLAPSED = 32;

export const ArtworkHeroCard = React.memo(function ArtworkHeroCard({
  model,
  collapsed = false,
  onExpand,
}: ArtworkHeroCardProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();

  useEffect(() => {
    if (!model) return;
    console.debug('[A2] artwork_hero_rendered', {
      has_title: model.title !== null,
      has_artist: model.artist !== null,
      has_museum: model.museum !== null,
      collapsed,
    });
  }, [model, collapsed]);

  if (!model) return null;

  const titleText = model.title ?? t('chat.artworkHero.untitled');

  const a11yLabel = !model.title
    ? t('chat.artworkHero.a11y_label_untitled')
    : model.artist
      ? t('chat.artworkHero.a11y_label', { title: model.title, artist: model.artist })
      : t('chat.artworkHero.a11y_label_no_artist', { title: model.title });

  const a11yHint = onExpand ? t('chat.artworkHero.a11y_hint') : undefined;

  const thumbSize = collapsed ? THUMB_COLLAPSED : THUMB_EXPANDED;
  const locationLine = collapsed ? null : artworkLocation(model.museum, model.room);

  return (
    <Pressable
      onPress={onExpand}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      accessibilityHint={a11yHint}
      style={[
        styles.root,
        collapsed && styles.rootCollapsed,
        { backgroundColor: theme.surface, borderColor: theme.cardBorder },
      ]}
      testID="artwork-hero-card"
    >
      <HeroThumb
        messageId={model.messageId}
        fallbackUrl={model.imageUrl}
        size={thumbSize}
        testID="artwork-hero-image"
      />
      <View style={styles.content}>
        <Text style={[styles.title, { color: theme.textPrimary }]} numberOfLines={1}>
          {titleText}
        </Text>
        {!collapsed && model.artist ? (
          <Text style={[styles.detail, { color: theme.textTertiary }]} numberOfLines={1}>
            {model.artist}
          </Text>
        ) : null}
        {locationLine ? (
          <Text style={[styles.location, { color: theme.placeholderText }]} numberOfLines={1}>
            {locationLine}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
});

interface HeroThumbProps {
  readonly messageId: string | null;
  readonly fallbackUrl: string;
  readonly size: number;
  readonly testID: string;
}

function HeroThumb({ messageId, fallbackUrl, size, testID }: HeroThumbProps): React.ReactElement {
  const { uri } = useCarnetImageSource({ messageId: messageId ?? '', fallbackUrl });
  return (
    <Image
      source={{ uri }}
      style={{ width: size, height: size, borderRadius: size / 2 }}
      accessibilityIgnoresInvertColors
      testID={testID}
    />
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space['2.5'],
    paddingHorizontal: semantic.chat.bubblePaddingX,
    paddingVertical: semantic.list.itemPaddingYCompact,
    marginHorizontal: space['3'],
    marginTop: space['2'],
    borderRadius: semantic.card.radius,
    borderWidth: StyleSheet.hairlineWidth,
  },
  rootCollapsed: {
    paddingVertical: space['1.5'],
  },
  content: {
    flex: 1,
  },
  title: {
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  detail: {
    marginTop: space['0.5'],
    fontSize: fontSize.xs,
  },
  location: {
    marginTop: space['0.5'],
    fontSize: semantic.section.labelSize,
  },
});
