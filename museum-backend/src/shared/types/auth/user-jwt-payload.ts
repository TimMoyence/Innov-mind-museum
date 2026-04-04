import type { UserRole } from '@modules/auth/domain/user-role';

/** Claims embedded in a signed JWT access token identifying the authenticated user. */
export interface UserJwtPayload {
  id: number;
  role: UserRole;
  museumId?: number | null;
}
