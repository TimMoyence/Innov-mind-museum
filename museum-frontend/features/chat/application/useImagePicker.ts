import { useCallback, useState } from 'react';
import { Alert, Linking } from 'react-native';
import * as ImagePickerLib from 'expo-image-picker';

/**
 * Hook that manages image selection state and handlers for chat attachments.
 * Supports gallery picking and native camera capture.
 */
export const useImagePicker = () => {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [pendingImage, setPendingImage] = useState<string | null>(null);

  const onPickImage = useCallback(async () => {
    const { status } = await ImagePickerLib.requestMediaLibraryPermissionsAsync();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison -- Expo permission status API
    if (status !== 'granted') {
      return;
    }

    const result = await ImagePickerLib.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.8,
    });

    if (!result.canceled && result.assets.length) {
      setPendingImage(result.assets[0].uri);
    }
  }, []);

  const onTakePicture = useCallback(async () => {
    const { status } = await ImagePickerLib.requestCameraPermissionsAsync();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison -- Expo permission status API
    if (status !== 'granted') {
      Alert.alert('Camera Access', 'Camera permission is required. Please enable it in Settings.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Settings', onPress: () => void Linking.openSettings() },
      ]);
      return;
    }

    const result = await ImagePickerLib.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.8,
    });

    if (!result.canceled && result.assets.length) {
      setPendingImage(result.assets[0].uri);
    }
  }, []);

  const confirmPendingImage = useCallback((uri: string) => {
    setSelectedImage(uri);
    setPendingImage(null);
  }, []);

  const cancelPendingImage = useCallback(() => {
    setPendingImage(null);
  }, []);

  const clearSelectedImage = useCallback(() => {
    setSelectedImage(null);
  }, []);

  return {
    selectedImage,
    pendingImage,
    onPickImage,
    onTakePicture,
    confirmPendingImage,
    cancelPendingImage,
    clearSelectedImage,
  };
};
