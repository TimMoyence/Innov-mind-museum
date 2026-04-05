/* eslint-disable @typescript-eslint/no-deprecated -- expo-image-manipulator API migration pending */
import { Image } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';

const TARGET_IMAGE_BYTES = 2_700_000;
const MAX_IMAGE_DIMENSION_PX = 1600;
const QUALITY_STEPS = [0.82, 0.72, 0.62, 0.52, 0.42] as const;

interface ImageDimensions {
  width: number;
  height: number;
}

const getImageDimensions = async (uri: string): Promise<ImageDimensions | null> => {
  try {
    return await new Promise<ImageDimensions>((resolve, reject) => {
      Image.getSize(
        uri,
        (width, height) => {
          resolve({ width, height });
        },
        reject,
      );
    });
  } catch {
    return null;
  }
};

const getFileSize = async (uri: string): Promise<number | undefined> => {
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists || typeof info.size !== 'number') {
    return undefined;
  }
  return info.size;
};

const buildResizeAction = (
  dimensions: ImageDimensions | null,
): { resize: { width?: number; height?: number } } | null => {
  if (!dimensions) return null;
  const longestSide = Math.max(dimensions.width, dimensions.height);
  if (longestSide <= MAX_IMAGE_DIMENSION_PX) {
    return null;
  }

  if (dimensions.width >= dimensions.height) {
    return { resize: { width: MAX_IMAGE_DIMENSION_PX } };
  }
  return { resize: { height: MAX_IMAGE_DIMENSION_PX } };
};

/**
 * Optimizes an image before upload (resize + progressive JPEG compression).
 * Returns a URI that is typically below backend upload limits.
 */
export const optimizeImageForUpload = async (uri: string): Promise<string> => {
  const [initialSize, dimensions] = await Promise.all([getFileSize(uri), getImageDimensions(uri)]);
  const resizeAction = buildResizeAction(dimensions);

  const shouldOptimize =
    resizeAction !== null || (typeof initialSize === 'number' && initialSize > TARGET_IMAGE_BYTES);

  if (!shouldOptimize) {
    return uri;
  }

  let workingUri = uri;
  let firstPass = true;

  for (const quality of QUALITY_STEPS) {
    const actions = firstPass && resizeAction ? [resizeAction] : [];
    const optimized = await ImageManipulator.manipulateAsync(workingUri, actions, {
      compress: quality,
      format: ImageManipulator.SaveFormat.JPEG,
    });
    workingUri = optimized.uri;
    firstPass = false;

    const optimizedSize = await getFileSize(workingUri);
    if (typeof optimizedSize !== 'number' || optimizedSize <= TARGET_IMAGE_BYTES) {
      return workingUri;
    }
  }

  return workingUri;
};
