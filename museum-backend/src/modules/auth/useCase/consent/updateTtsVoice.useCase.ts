import { isTtsVoice, type TtsVoice } from '@modules/chat/domain/voice-catalog';
import { badRequest, notFound } from '@shared/errors/app.error';

import type { IUserRepository } from '@modules/auth/domain/user/user.repository.interface';

/** `null` resets to env-level default (`env.tts.voice`). Validated against {@link TTS_VOICES}. */
export class UpdateTtsVoiceUseCase {
  constructor(private readonly userRepository: IUserRepository) {}

  /**
   * @throws {AppError} 400 if voice not in catalog.
   * @throws {AppError} 404 if user does not exist.
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
