/**
 * `useCompareImagePicker` — picks a gallery image and returns it in the RN
 * `{ uri, name, type }` file shape that `useCompareImage` / `imageComparisonApi`
 * expect (Cycle D, Option C).
 *
 * Kept separate from `useImagePicker` (which drives the C2 chat-send flow and
 * only tracks a `selectedImage` URI string): the compare action needs the full
 * file descriptor to POST multipart to `/chat/compare`, and must not disturb
 * the C2 `selectedImage` state (NFR-4 — no C2 regression).
 *
 * Returns `null` on cancel / permission-denied so the caller simply does
 * nothing (no compare fired).
 */
import { useCallback } from 'react';
import { Alert, Linking } from 'react-native';
import { useTranslation } from 'react-i18next';
import * as ImagePickerLib from 'expo-image-picker';

import { normalizeImageMimeTypeFromExtension } from '@/features/chat/infrastructure/chatApi/_internals';
import { optimizeImageForUpload } from './imageUploadOptimization';

/** RN-shaped image file consumed by the compare pipeline. */
export interface CompareImageFile {
  uri: string;
  name: string;
  type: string;
}

/** Derives the `{ name, type }` from a (possibly query-stringed) image URI. */
const describeImage = (uri: string): { name: string; type: string } => {
  const lastSegment = uri.split('/').pop() ?? 'photo.jpg';
  const beforeQuery = lastSegment.split('?')[0];
  const name = beforeQuery && beforeQuery.length > 0 ? beforeQuery : 'photo.jpg';
  const extension = name.includes('.') ? name.split('.').pop() : undefined;
  return { name, type: normalizeImageMimeTypeFromExtension(extension) };
};

export const useCompareImagePicker = () => {
  const { t } = useTranslation();

  const pickForCompare = useCallback(async (): Promise<CompareImageFile | null> => {
    const { status } = await ImagePickerLib.requestMediaLibraryPermissionsAsync();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison -- expo-image-picker returns string-typed status from permission APIs
    if (status !== 'granted') {
      Alert.alert(t('permissions.galleryTitle'), t('permissions.galleryMessage'), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('common.settings'), onPress: () => void Linking.openSettings() },
      ]);
      return null;
    }

    let result;
    try {
      result = await ImagePickerLib.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.8,
      });
    } catch {
      return null; // Picker failed or was cancelled abnormally
    }

    if (result.canceled) return null;
    const firstAsset = result.assets[0];
    if (!firstAsset) return null;

    // Local optimization keeps the upload small; fall back to the raw URI so a
    // failed optimization never blocks the compare flow (parity useImagePicker).
    let uri = firstAsset.uri;
    try {
      uri = await optimizeImageForUpload(firstAsset.uri);
    } catch {
      uri = firstAsset.uri;
    }

    return { uri, ...describeImage(uri) };
  }, [t]);

  return { pickForCompare };
};
