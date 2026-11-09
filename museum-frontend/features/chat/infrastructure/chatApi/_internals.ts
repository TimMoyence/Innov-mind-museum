import { createAppError } from '@/shared/types/AppError';

export const CHAT_BASE = '/api/chat';

export const MODEL_REPLY_TIMEOUT_MS = 60_000;

export const audioMimeByExtension: Record<string, string> = {
  m4a: 'audio/mp4',
  mp4: 'audio/mp4',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  webm: 'audio/webm',
  ogg: 'audio/ogg',
  aac: 'audio/aac',
};

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

export const appendRnFile = (
  formData: FormData,
  field: string,
  file: { uri: string; name: string; type: string },
): void => {
  formData.append(field, file as unknown as Blob);
};
