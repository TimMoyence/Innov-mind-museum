export const UserRole = {
  VISITOR: 'visitor',
  MODERATOR: 'moderator',
  MUSEUM_MANAGER: 'museum_manager',
  ADMIN: 'admin',
  SUPER_ADMIN: 'super_admin',
} as const;

export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const MUSEUM_STAFF_ROLES = [
  UserRole.ADMIN,
  UserRole.MODERATOR,
  UserRole.MUSEUM_MANAGER,
] as const satisfies readonly UserRole[];

export const hasRole = (role: string | undefined, allowed: readonly string[]): boolean =>
  role === UserRole.SUPER_ADMIN || (role !== undefined && allowed.includes(role));
