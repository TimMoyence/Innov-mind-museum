import { useCallback } from 'react';
import { Alert, Linking } from 'react-native';
import { useTranslation } from 'react-i18next';
import * as ImagePickerLib from 'expo-image-picker';

import { normalizeImageMimeTypeFromExtension } from '@/features/chat/infrastructure/chatApi/_internals';
import { optimizeImageAdaptive } from './imageUploadOptimization';
import { decideCompression, resolveCompressionMode } from './compressionDecision.pure';
import { useDataMode } from './DataModeProvider';

export interface CompareImageFile {
  uri: string;
  name: string;
  type: string;
}

const describeImage = (uri: string): { name: string; type: string } => {
  const lastSegment = uri.split('/').pop() ?? 'photo.jpg';
  const beforeQuery = lastSegment.split('?')[0];
  const name = beforeQuery && beforeQuery.length > 0 ? beforeQuery : 'photo.jpg';
  const extension = name.includes('.') ? name.split('.').pop() : undefined;
  return { name, type: normalizeImageMimeTypeFromExtension(extension) };
};

export const useCompareImagePicker = () => {
  const { t } = useTranslation();
  const { resolved, preference, metered } = useDataMode();

  const pickForCompare = useCallback(async (): Promise<CompareImageFile | null> => {
    const { status } = await ImagePickerLib.requestMediaLibraryPermissionsAsync();
    if (status !== ImagePickerLib.PermissionStatus.GRANTED) {
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
      return null;
    }

    if (result.canceled) return null;
    const firstAsset = result.assets[0];
    if (!firstAsset) return null;

    const decision = decideCompression(
      resolveCompressionMode({ resolved, preference, metered }),
      true,
    );
    let uri: string;
    try {
      const { uploadUri } = await optimizeImageAdaptive(firstAsset.uri, decision);
      uri = uploadUri;
    } catch {
      uri = firstAsset.uri;
    }

    return { uri, ...describeImage(uri) };
  }, [resolved, preference, metered, t]);

  return { pickForCompare };
};
