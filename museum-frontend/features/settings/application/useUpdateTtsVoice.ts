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
