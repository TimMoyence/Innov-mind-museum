/**
 * A2 — Artwork hero card pinned (collapsed/expanded modes).
 *
 * Renders a sticky pin-row above the message list with the user-uploaded
 * artwork + detected metadata. Two modes:
 *
 *   - Expanded (default) : 56dp thumb + title + artist + museum-room.
 *   - Collapsed (mini)   : 32dp thumb + title only.
 *
 * `model === null` → renders `null` (no DOM). The hero is always mounted at
 * screen level ; data-gating happens here so the screen JSX stays clean.
 *
 * A11y : `Pressable` with `accessibilityRole="button"`, i18n label
 * (interpolated with title + artist), `accessibilityHint` only when
 * `onExpand` is provided. No unicode emoji (Ionicons + RN Image only).
 *
 * Telemetry : one `console.debug('[A2] artwork_hero_rendered', {...})` per
 * render with flags (`has_title`, `has_artist`, `has_museum`, `collapsed`).
 * No image URL / artwork ID emitted (NFR4 — image URLs are signed S3 ephemeral
 * but still excluded from logs).
 *
 * Spec: docs/chat-ux-refonte/specs/A2.md §1.2 (R8-R15).
 */

import React, { useEffect } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

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
    // R28 — flag-only telemetry (no PII, no URLs). console.debug intentionally
    // (no Sentry V1 — deferred per dispatcher Q5).
    console.debug('[A2] artwork_hero_rendered', {
      has_title: model.title !== null,
      has_artist: model.artist !== null,
      has_museum: model.museum !== null,
      collapsed,
    });
  }, [model, collapsed]);

  if (!model) return null;

  const titleText = model.title ?? t('chat.artworkHero.untitled');

  const a11yLabel = model.title
    ? t('chat.artworkHero.a11y_label', {
        title: model.title,
        artist: model.artist ?? '',
      })
    : t('chat.artworkHero.a11y_label_untitled');

  const a11yHint = onExpand ? t('chat.artworkHero.a11y_hint') : undefined;

  const thumbSize = collapsed ? THUMB_COLLAPSED : THUMB_EXPANDED;
  const locationLine =
    !collapsed && model.museum ? [model.museum, model.room].filter(Boolean).join(' — ') : null;

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

/**
 * Resolves the hero thumbnail through {@link useCarnetImageSource} so the image
 * survives a signed-URL expiry / app-data wipe (D4): it prefers the durable
 * cache, re-mints a fresh signed URL on a miss, and only falls back to the
 * embedded (possibly stale) `fallbackUrl` when re-minting fails.
 */
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
