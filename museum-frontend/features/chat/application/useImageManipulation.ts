import { useCallback, useState } from 'react';
import { ImageManipulator, SaveFormat, type ImageManipulatorContext } from 'expo-image-manipulator';

const renderJpeg = async (
  uri: string,
  apply: (context: ImageManipulatorContext) => ImageManipulatorContext,
): Promise<string> => {
  const image = await apply(ImageManipulator.manipulate(uri)).renderAsync();
  const result = await image.saveAsync({ compress: 0.8, format: SaveFormat.JPEG });
  return result.uri;
};

export const useImageManipulation = () => {
  const [isProcessing, setIsProcessing] = useState(false);

  const rotateImage = useCallback(async (uri: string): Promise<string> => {
    setIsProcessing(true);
    try {
      return await renderJpeg(uri, (context) => context.rotate(90));
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
        return await renderJpeg(uri, (context) => context.crop(crop));
      } finally {
        setIsProcessing(false);
      }
    },
    [],
  );

  return { rotateImage, cropImage, isProcessing };
};
