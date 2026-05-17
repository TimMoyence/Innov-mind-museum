import type { UserRole } from '@modules/auth/domain/user/user-role';

export interface UserJwtPayload {
  id: number;
  role: UserRole;
  museumId?: number | null;
}
