/**
 * Spec C T2.8 — TanStack mutation hook for the TTS voice preference.
 *
 * Posts the chosen voice to `PATCH /api/auth/tts-voice` via
 * {@link authService.updateTtsVoice} and invalidates the `['user', 'me']`
 * profile query on success so the UI re-reads the freshly persisted value.
 *
 * Pass `null` as the mutation argument to reset the preference to the
 * env-level default (matches the BE Zod schema landed in T2.4).
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { authService } from '@/features/auth/infrastructure/authApi';
import type { TtsVoice } from '@/features/settings/voice-catalog';

export const useUpdateTtsVoice = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (voice: TtsVoice | null) => authService.updateTtsVoice(voice),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['user', 'me'] });
    },
  });
};
