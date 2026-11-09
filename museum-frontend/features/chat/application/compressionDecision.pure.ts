export interface ImageProfile {
  maxDimensionPx: number;
  format: 'webp' | 'jpeg';
  quality: number;
  targetBytes: number;
}

export interface CompressionDecision {
  upload: ImageProfile;
  localDerivative?: ImageProfile;
}

export type CompressionDataMode = 'low' | 'edge' | 'normal';

export function resolveCompressionMode(args: {
  resolved: 'low' | 'normal';
  preference: 'auto' | 'low' | 'normal';
  metered: boolean;
}): CompressionDataMode {
  if (args.resolved === 'low') return 'low';
  if (args.preference === 'auto' && args.metered) return 'low';
  return 'normal';
}

const NORMAL_UPLOAD: ImageProfile = {
  maxDimensionPx: 1600,
  format: 'jpeg',
  quality: 0.72,
  targetBytes: 2_700_000,
};

export const IMAGE_PROFILES = {
  normal: NORMAL_UPLOAD,
  lowUploadWebp: {
    maxDimensionPx: 1024,
    format: 'webp',
    quality: 0.6,
    targetBytes: 150_000,
  },
  lowUploadJpeg: {
    maxDimensionPx: 1024,
    format: 'jpeg',
    quality: 0.55,
    targetBytes: 220_000,
  },
  lowDerivativeWebp: {
    maxDimensionPx: 1280,
    format: 'webp',
    quality: 0.7,
    targetBytes: 320_000,
  },
  lowDerivativeJpeg: {
    maxDimensionPx: 1280,
    format: 'jpeg',
    quality: 0.7,
    targetBytes: 320_000,
  },
} as const satisfies Record<string, ImageProfile>;

export const decideCompression = (
  resolvedDataMode: CompressionDataMode,
  webpSupported: boolean,
): CompressionDecision => {
  if (resolvedDataMode === 'normal') {
    return { upload: IMAGE_PROFILES.normal };
  }

  if (webpSupported) {
    return {
      upload: IMAGE_PROFILES.lowUploadWebp,
      localDerivative: IMAGE_PROFILES.lowDerivativeWebp,
    };
  }

  return {
    upload: IMAGE_PROFILES.lowUploadJpeg,
    localDerivative: IMAGE_PROFILES.lowDerivativeJpeg,
  };
};
