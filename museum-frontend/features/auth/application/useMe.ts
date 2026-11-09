import { authService } from '@/features/auth/infrastructure/authApi';
import { useAppQuery } from '@/shared/data/useAppQuery';
import type { paths } from '@/shared/api/generated/openapi';

type AuthMeResponse = paths['/api/auth/me']['get']['responses'][200]['content']['application/json'];

export const useMe = () => {
  return useAppQuery<AuthMeResponse, ['user', 'me']>({
    queryKey: ['user', 'me'],
    queryFn: ({ signal }) => authService.me({ signal }),
  });
};
