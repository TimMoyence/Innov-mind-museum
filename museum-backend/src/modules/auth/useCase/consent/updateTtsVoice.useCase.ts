import { isTtsVoice, type TtsVoice } from '@modules/chat/domain/voice-catalog';
import { invalidInput, notFound } from '@shared/errors/app.error';

import type { IUserRepository } from '@modules/auth/domain/user/user.repository.interface';

export class UpdateTtsVoiceUseCase {
  constructor(private readonly userRepository: IUserRepository) {}

  async execute(userId: number, voice: TtsVoice | null): Promise<{ ttsVoice: TtsVoice | null }> {
    if (voice !== null && !isTtsVoice(voice)) {
      throw invalidInput(`invalid voice "${String(voice)}"`);
    }
    const user = await this.userRepository.getUserById(userId);
    if (!user) {
      throw notFound('User not found');
    }
    await this.userRepository.updateTtsVoice(userId, voice);
    return { ttsVoice: voice };
  }
}
