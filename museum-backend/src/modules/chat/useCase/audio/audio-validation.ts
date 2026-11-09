import { invalidInput } from '@shared/errors/app.error';
import { env } from '@src/config/env';

import type { PostAudioMessageInput } from '@modules/chat/domain/chat.types';

export function validateAudioInput(audio: PostAudioMessageInput['audio']): void {
  if (!audio.base64.trim()) {
    throw invalidInput('Audio payload is required');
  }
  if (!audio.mimeType.trim()) {
    throw invalidInput('Audio mime type is required');
  }
  if (
    !Number.isFinite(audio.sizeBytes) ||
    audio.sizeBytes <= 0 ||
    audio.sizeBytes > env.llm.maxAudioBytes
  ) {
    throw invalidInput(`Audio exceeds max size of ${String(env.llm.maxAudioBytes)} bytes`);
  }
  if (!env.upload.allowedAudioMimeTypes.includes(audio.mimeType)) {
    throw invalidInput(`Unsupported audio mime type: ${audio.mimeType}`);
  }
}
