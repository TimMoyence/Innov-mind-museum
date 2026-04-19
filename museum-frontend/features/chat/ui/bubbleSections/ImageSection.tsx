import { memo, useCallback, useEffect } from 'react';
import { Image, StyleSheet } from 'react-native';

import { useTheme } from '@/shared/ui/ThemeContext';
import { radius, semantic, space } from '@/shared/ui/tokens';

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
      resizeMode="cover"
      onError={handleImageError}
    />
  );
});

const styles = StyleSheet.create({
  messageImage: {
    marginTop: space['2'],
    width: semantic.media.imagePreview,
    height: semantic.media.imagePreview,
    borderRadius: radius.lg,
    borderWidth: semantic.input.borderWidth,
  },
});
