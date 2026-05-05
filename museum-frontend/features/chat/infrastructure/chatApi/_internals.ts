import { createAppError } from '@/shared/types/AppError';

/** Base path for all chat HTTP endpoints. */
export const CHAT_BASE = '/api/chat';

/** Maps audio file extensions to MIME types for `postAudioMessage` form uploads. */
export const audioMimeByExtension: Record<string, string> = {
  m4a: 'audio/mp4',
  mp4: 'audio/mp4',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  webm: 'audio/webm',
  ogg: 'audio/ogg',
  aac: 'audio/aac',
};

/** Resolves a sane image MIME type from a filename extension; defaults to JPEG. */
export const normalizeImageMimeTypeFromExtension = (extensionRaw: string | undefined): string => {
  const extension = (extensionRaw ?? 'jpg').toLowerCase();
  if (extension === 'jpg') {
    return 'image/jpeg';
  }
  if (extension === 'jpeg') {
    return 'image/jpeg';
  }
  if (extension === 'png') {
    return 'image/png';
  }
  if (extension === 'webp') {
    return 'image/webp';
  }
  return `image/${extension}`;
};

/** Wraps a contract validator into an `AppError`-throwing assertion. */
export const ensureContract = <T>(
  payload: unknown,
  validator: (value: unknown) => value is T,
  label: string,
): T => {
  if (!validator(payload)) {
    throw createAppError({
      kind: 'Contract',
      code: 'invalid',
      message: `Invalid ${label} contract`,
      details: { label },
    });
  }

  return payload;
};

/**
 * Whether SSE streaming is enabled for chat messages. Controlled by
 * `EXPO_PUBLIC_CHAT_STREAMING`. Default `false`: the streaming path is
 * deactivated post-V1 (token-fluidity issues, ADR-001), so the client
 * falls back to a non-streaming POST and shows a typing indicator.
 */
export const isChatStreamingEnabled = (): boolean => {
  const raw = process.env.EXPO_PUBLIC_CHAT_STREAMING?.toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
};
