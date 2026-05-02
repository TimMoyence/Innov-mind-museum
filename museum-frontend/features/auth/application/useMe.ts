/**
 * Spec C T2.10 — TanStack query hook for the authenticated user's profile.
 *
 * Wraps `GET /api/auth/me` via {@link authService.me} and caches the result
 * under the `['me']` query key. Mutations that change the server-side
 * profile (e.g. {@link useUpdateTtsVoice}, the `AuthContext` foreground
 * resync) invalidate that key — without this hook subscribing, those
 * invalidation calls were forward-looking no-ops.
 *
 * Returns the raw `{ user: AuthUser }` envelope as defined by the BE
 * contract; consumers read `data?.user?.<field>` (e.g. `data?.user?.ttsVoice`).
 */
import { authService } from '@/features/auth/infrastructure/authApi';
import { useAppQuery } from '@/shared/data/useAppQuery';
import type { paths } from '@/shared/api/generated/openapi';

type AuthMeResponse = paths['/api/auth/me']['get']['responses'][200]['content']['application/json'];

export const useMe = () => {
  return useAppQuery<AuthMeResponse, ['me']>({
    queryKey: ['me'],
    queryFn: () => authService.me(),
  });
};
