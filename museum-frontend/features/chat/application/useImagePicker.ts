import { useCallback, useState } from 'react';
import * as ImagePickerLib from 'expo-image-picker';

/**
 * Hook that manages image selection state and handlers for chat attachments.
 * Supports gallery picking and camera capture via a callback pattern.
 */
export const useImagePicker = () => {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);

  const onPickImage = useCallback(async () => {
    const { status } = await ImagePickerLib.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      return;
    }

    const result = await ImagePickerLib.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets.length) {
      setSelectedImage(result.assets[0].uri);
    }
  }, []);

  const onTakePicture = useCallback(() => {
    setIsCameraOpen(true);
  }, []);

  const onCameraCapture = useCallback((uri: string) => {
    setSelectedImage(uri);
    setIsCameraOpen(false);
  }, []);

  const clearSelectedImage = useCallback(() => {
    setSelectedImage(null);
  }, []);

  return {
    selectedImage,
    isCameraOpen,
    setIsCameraOpen,
    onPickImage,
    onTakePicture,
    onCameraCapture,
    clearSelectedImage,
  };
};
