import { memo, useCallback, useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/shared/ui/ThemeContext';
import { radius, semantic } from '@/shared/ui/tokens';

const PROACTIVE_REFRESH_MS = 5 * 60 * 1000;

const isLocalFileUri = (url: string): boolean => url.startsWith('file://');

interface ImageSectionProps {
  messageId: string;
  url: string;
  expiresAt: string;
  onImageError: (messageId: string) => void;
}

/**
 * Renders the attached image on a chat bubble with a proactive signed-URL refresh:
 * when `expiresAt` is within 5 minutes, triggers `onImageError` so the parent
 * refetches a fresh signed URL before the current one expires.
 */
export const ImageSection = memo(function ImageSection({
  messageId,
  url,
  expiresAt,
  onImageError,
}: ImageSectionProps) {
  const { theme } = useTheme();
  const { t } = useTranslation();

  const handleImageError = useCallback(() => {
    onImageError(messageId);
  }, [onImageError, messageId]);

  useEffect(() => {
    if (isLocalFileUri(url)) return;

    const expiresMs = new Date(expiresAt).getTime();
    const remainingMs = expiresMs - Date.now();

    if (remainingMs <= PROACTIVE_REFRESH_MS) {
      onImageError(messageId);
      return;
    }

    const timerId = setTimeout(() => {
      onImageError(messageId);
    }, remainingMs - PROACTIVE_REFRESH_MS);

    return () => {
      clearTimeout(timerId);
    };
  }, [url, expiresAt, messageId, onImageError]);

  return (
    <Image
      source={{ uri: url }}
      style={[
        styles.messageImage,
        { borderColor: theme.separator, backgroundColor: theme.surface },
      ]}
      contentFit="cover"
      recyclingKey={messageId}
      cachePolicy="memory-disk"
      onError={handleImageError}
      accessibilityRole="image"
      accessibilityLabel={t('a11y.chat.attached_image')}
    />
  );
});

const styles = StyleSheet.create({
  messageImage: {
    width: semantic.media.imagePreview,
    height: semantic.media.imagePreview,
    borderRadius: radius.lg,
    borderWidth: semantic.input.borderWidth,
  },
});
