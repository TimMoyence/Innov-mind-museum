/**
 * Pure compression-decision module (no React, no expo) — W1-D1FE-01.
 *
 * Given a resolved DataMode and whether WebP encoding is supported on this
 * platform, it yields the compression profile(s) the adaptive optimizer should
 * apply before upload:
 *
 * - low / edge → TWO outputs: a small upload (~1024px WebP q~0.60 ~150KB) AND a
 *   larger `localDerivative` (~1280px WebP q~0.70 250-400KB) handed to the
 *   carnet (cluster E). When WebP is unsupported both fall back to JPEG.
 * - normal → the LEGACY single output (1600px JPEG 2.7MB, no derivative).
 *
 * It is intentionally side-effect-free so the choice can be unit-tested and
 * reused from any picker without pulling in the expo manipulator.
 */

/** Encoding target the optimizer feeds to expo-image-manipulator. */
export interface ImageProfile {
  /** Cap applied to the image's longest side, in logical pixels. */
  maxDimensionPx: number;
  /** Output container. WebP is smaller for photos; JPEG is the universal fallback. */
  format: 'webp' | 'jpeg';
  /** Encoder quality (0–1) — passed straight to `manipulateAsync` `compress`. */
  quality: number;
  /** Soft on-disk byte budget the progressive compression aims for. */
  targetBytes: number;
}

/** Output of {@link decideCompression}: the upload profile plus an optional derivative. */
export interface CompressionDecision {
  /** Profile for the bytes actually sent over the wire. */
  upload: ImageProfile;
  /**
   * Optional larger profile kept on-device for the carnet (cluster E / D4).
   * Present only on weak networks where the upload itself is heavily shrunk.
   */
  localDerivative?: ImageProfile;
}

/** DataMode the picker resolved. `edge` is treated like `low` (even weaker network). */
export type CompressionDataMode = 'low' | 'edge' | 'normal';

/**
 * Resolves the compression mode from the QUALITY axis (`resolved`) plus the
 * COST axis (`metered`, gated by the user `preference`) — D-06, run
 * undefined-network-detection-reliability.
 *
 * Returns `'low'` iff `resolved === 'low'` OR (`preference === 'auto'` AND
 * `metered`), otherwise `'normal'` — never the dead `'edge'` mode:
 * - `resolved === 'low'` (measured quality, label 2g/3g, offline, or explicit
 *   `low` preference via the resolver) always compresses aggressively;
 * - metered networks in `auto` compress aggressively even when healthy
 *   (US-02.3 — an upload's volume is a COST, INV-02);
 * - an explicit `'normal'` preference bypasses the cost gate (US-08.2, INV-03).
 *
 * Pure, side-effect-free companion to {@link decideCompression}: callers feed
 * the result straight into `decideCompression(mode, webpSupported)`.
 */
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

/**
 * Named profiles, keyed for direct reuse + assertion. `.normal` is the legacy
 * single-output default; the weak-network profiles are produced per WebP support.
 */
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

/**
 * Picks the compression profile(s) for a given resolved data mode.
 *
 * @param resolvedDataMode `normal` keeps the legacy 1600 JPEG single output;
 *   `low`/`edge` produce a small upload plus an on-device derivative.
 * @param webpSupported when `false`, every weak-network profile falls back to
 *   JPEG (the universal codec) instead of WebP.
 */
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
