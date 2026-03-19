import { useCallback, useState } from 'react';
import * as ImageManipulator from 'expo-image-manipulator';

/** Hook that provides image crop and rotate operations via expo-image-manipulator. */
export const useImageManipulation = () => {
  const [isProcessing, setIsProcessing] = useState(false);

  const rotateImage = useCallback(async (uri: string): Promise<string> => {
    setIsProcessing(true);
    try {
      const result = await ImageManipulator.manipulateAsync(
        uri,
        [{ rotate: 90 }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG },
      );
      return result.uri;
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const cropImage = useCallback(
    async (
      uri: string,
      crop: { originX: number; originY: number; width: number; height: number },
    ): Promise<string> => {
      setIsProcessing(true);
      try {
        const result = await ImageManipulator.manipulateAsync(
          uri,
          [{ crop }],
          { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG },
        );
        return result.uri;
      } finally {
        setIsProcessing(false);
      }
    },
    [],
  );

  return { rotateImage, cropImage, isProcessing };
};
