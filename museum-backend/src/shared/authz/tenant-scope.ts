import { forbidden } from '@shared/errors/app.error';

import type { UserRole } from '@modules/auth/domain/user/user-role';

export function computeTenantScope(
  role: UserRole | undefined,
  museumId: number | null | undefined,
): number | null {
  if (role === 'museum_manager') {
    if (museumId == null) {
      throw forbidden('No museum assigned');
    }
    return museumId;
  }

  return null;
}
