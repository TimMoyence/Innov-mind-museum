import { Image } from 'expo-image';
import * as ImageManipulator from 'expo-image-manipulator';

import type {
  CompressionDecision,
  ImageProfile,
} from '@/features/chat/application/compressionDecision.pure';

interface ImageDimensions {
  width: number;
  height: number;
}

const getImageDimensions = async (uri: string): Promise<ImageDimensions | null> => {
  try {
    const ref = await Image.loadAsync({ uri });
    return { width: ref.width, height: ref.height };
  } catch {
    return null;
  }
};

export interface AdaptiveOptimizationResult {
  uploadUri: string;
  localDerivativeUri?: string;
}

const SaveFormatByProfile: Record<ImageProfile['format'], ImageManipulator.SaveFormat> = {
  webp: ImageManipulator.SaveFormat.WEBP,
  jpeg: ImageManipulator.SaveFormat.JPEG,
};

const buildProfileResizeAction = (
  profile: ImageProfile,
  dimensions: ImageDimensions | null,
): { resize: { width?: number; height?: number } } => {
  if (dimensions && dimensions.height > dimensions.width) {
    return { resize: { height: profile.maxDimensionPx } };
  }
  return { resize: { width: profile.maxDimensionPx } };
};

const encodeToProfile = async (
  uri: string,
  profile: ImageProfile,
  dimensions: ImageDimensions | null,
): Promise<string | null> => {
  const resizeAction = buildProfileResizeAction(profile, dimensions);
  try {
    const ref = await ImageManipulator.ImageManipulator.manipulate(uri)
      .resize(resizeAction.resize)
      .renderAsync();
    const out = await ref.saveAsync({
      compress: profile.quality,
      format: SaveFormatByProfile[profile.format],
    });
    return out.uri;
  } catch {
    if (profile.format !== 'webp') {
      return null;
    }
    try {
      const fallbackRef = await ImageManipulator.ImageManipulator.manipulate(uri)
        .resize(resizeAction.resize)
        .renderAsync();
      const fallback = await fallbackRef.saveAsync({
        compress: 0.55,
        format: ImageManipulator.SaveFormat.JPEG,
      });
      return fallback.uri;
    } catch {
      return null;
    }
  }
};

export const optimizeImageAdaptive = async (
  uri: string,
  decision: CompressionDecision,
): Promise<AdaptiveOptimizationResult> => {
  const dimensions = await getImageDimensions(uri);

  const encodedUpload = await encodeToProfile(uri, decision.upload, dimensions);
  const uploadUri = encodedUpload ?? uri;

  if (!decision.localDerivative) {
    return { uploadUri };
  }

  const encodedDerivative = await encodeToProfile(uri, decision.localDerivative, dimensions);
  if (encodedDerivative === null) {
    return { uploadUri };
  }

  return { uploadUri, localDerivativeUri: encodedDerivative };
};
