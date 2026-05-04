import { badRequest } from '@shared/errors/app.error';
import { env } from '@src/config/env';

import type { PostAudioMessageInput } from '@modules/chat/domain/chat.types';

/**
 * Validates an incoming audio payload against size, mime type, and format constraints.
 * Throws an {@link AppError} with a 400 status if any rule fails.
 */
export function validateAudioInput(audio: PostAudioMessageInput['audio']): void {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- defensive: audio fields may be undefined from external API input
  if (!audio?.base64?.trim()) {
    throw badRequest('Audio payload is required');
  }
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- defensive: mimeType may be undefined from external API input
  if (!audio.mimeType?.trim()) {
    throw badRequest('Audio mime type is required');
  }
  if (
    !Number.isFinite(audio.sizeBytes) ||
    audio.sizeBytes <= 0 ||
    audio.sizeBytes > env.llm.maxAudioBytes
  ) {
    throw badRequest(`Audio exceeds max size of ${String(env.llm.maxAudioBytes)} bytes`);
  }
  if (!env.upload.allowedAudioMimeTypes.includes(audio.mimeType)) {
    throw badRequest(`Unsupported audio mime type: ${audio.mimeType}`);
  }
}
