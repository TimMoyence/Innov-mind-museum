import { useCallback, useState } from 'react';
import * as ImagePickerLib from 'expo-image-picker';

/**
 * Hook that manages image selection state and handlers for chat attachments.
 * Supports gallery picking and camera capture via a callback pattern.
 */
export const useImagePicker = () => {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);

  const onPickImage = useCallback(async () => {
    const { status } = await ImagePickerLib.requestMediaLibraryPermissionsAsync();
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

  const onTakePicture = useCallback(() => {
    setIsCameraOpen(true);
  }, []);

  const onCameraCapture = useCallback((uri: string) => {
    setPendingImage(uri);
    setIsCameraOpen(false);
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
    isCameraOpen,
    setIsCameraOpen,
    onPickImage,
    onTakePicture,
    onCameraCapture,
    confirmPendingImage,
    cancelPendingImage,
    clearSelectedImage,
  };
};
