/* eslint-disable @typescript-eslint/no-deprecated -- expo-image-manipulator API migration pending */
import { Image } from 'expo-image';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';

import type {
  CompressionDecision,
  ImageProfile,
} from '@/features/chat/application/compressionDecision.pure';

const TARGET_IMAGE_BYTES = 2_700_000;
const MAX_IMAGE_DIMENSION_PX = 1600;
const QUALITY_STEPS = [0.82, 0.72, 0.62, 0.52, 0.42] as const;

interface ImageDimensions {
  width: number;
  height: number;
}

const getImageDimensions = async (uri: string): Promise<ImageDimensions | null> => {
  // expo-image equivalent of RN `Image.getSize(uri, cb, err)` is
  // `Image.loadAsync({ uri }) → Promise<ImageRef>` where `width`/`height`
  // are exposed on the ImageRef (logical pixels, multiply by `scale` for
  // device pixels — we want logical here so longest-side resize ratios
  // remain correct against MAX_IMAGE_DIMENSION_PX).
  try {
    const ref = await Image.loadAsync({ uri });
    return { width: ref.width, height: ref.height };
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

/** Two URIs produced by the adaptive pipeline. */
export interface AdaptiveOptimizationResult {
  /** URI of the bytes to send over the wire (small on weak networks). */
  uploadUri: string;
  /**
   * Optional larger on-device derivative for the carnet (cluster E / D4).
   * The caller hands this off; this module never persists it.
   */
  localDerivativeUri?: string;
}

const SaveFormatByProfile: Record<ImageProfile['format'], ImageManipulator.SaveFormat> = {
  webp: ImageManipulator.SaveFormat.WEBP,
  jpeg: ImageManipulator.SaveFormat.JPEG,
};

/**
 * Builds the orientation-aware resize action for a profile. The longest side is
 * capped to `profile.maxDimensionPx`; dimensions are read once and reused.
 * Falls back to a width-cap when the source dimensions are unknown so the
 * downscale still happens (weak-network uploads must never ship a 4000px frame).
 */
const buildProfileResizeAction = (
  profile: ImageProfile,
  dimensions: ImageDimensions | null,
): { resize: { width?: number; height?: number } } => {
  if (dimensions && dimensions.height > dimensions.width) {
    return { resize: { height: profile.maxDimensionPx } };
  }
  return { resize: { width: profile.maxDimensionPx } };
};

/**
 * Encodes `uri` to a single profile. On a WebP encode failure, retries once as
 * JPEG (q~0.55) so an unsupported-codec platform still produces an upload.
 * Returns `null` only when even the JPEG fallback throws — the caller then uses
 * the raw URI rather than blocking the flow.
 */
const encodeToProfile = async (
  uri: string,
  profile: ImageProfile,
  dimensions: ImageDimensions | null,
): Promise<string | null> => {
  const resizeAction = buildProfileResizeAction(profile, dimensions);
  try {
    // NEW context API (expo-image-manipulator @55, lib-docs §1): chain
    // manipulate → resize → renderAsync → ImageRef.saveAsync. The flat
    // `manipulateAsync` is deprecated; new code must not use it.
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
      // A non-WebP failure has no safer codec to retry — surface as raw fallback.
      return null;
    }
    // WebP unsupported on this platform → retry the universal JPEG codec.
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

/**
 * Adaptive variant of {@link optimizeImageForUpload}: encodes per the supplied
 * {@link CompressionDecision} (typically derived from `useDataMode().resolved`
 * via `decideCompression`). Produces a small upload plus, when the decision
 * requests it, a larger on-device `localDerivative` for the carnet.
 *
 * Resilience: a failed encode never blocks the upload — the raw `uri` is used
 * as a last resort, and the derivative is simply omitted on failure.
 */
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
