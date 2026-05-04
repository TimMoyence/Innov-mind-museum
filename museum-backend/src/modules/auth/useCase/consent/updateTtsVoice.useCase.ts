import { isTtsVoice, type TtsVoice } from '@modules/chat/voice-catalog';
import { badRequest, notFound } from '@shared/errors/app.error';

import type { IUserRepository } from '../../domain/user/user.repository.interface';

/**
 * Persists a user's preferred TTS voice. `null` resets the user back to the
 * env-level default (`env.tts.voice`). The voice is validated against the
 * shared {@link TTS_VOICES} catalog before any persistence.
 */
export class UpdateTtsVoiceUseCase {
  constructor(private readonly userRepository: IUserRepository) {}

  /**
   * Validates and persists the requested voice.
   *
   * @param userId - Authenticated user id.
   * @param voice - Catalog voice id, or `null` to reset to the env default.
   * @throws {AppError} 400 if the voice is not in the catalog.
   * @throws {AppError} 404 if the user does not exist.
   */
  async execute(userId: number, voice: TtsVoice | null): Promise<{ ttsVoice: TtsVoice | null }> {
    if (voice !== null && !isTtsVoice(voice)) {
      throw badRequest(`invalid voice "${String(voice)}"`);
    }
    const user = await this.userRepository.getUserById(userId);
    if (!user) {
      throw notFound('User not found');
    }
    await this.userRepository.updateTtsVoice(userId, voice);
    return { ttsVoice: voice };
  }
}
