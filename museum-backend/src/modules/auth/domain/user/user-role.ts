export const UserRole = {
  VISITOR: 'visitor',
  MODERATOR: 'moderator',
  MUSEUM_MANAGER: 'museum_manager',
  ADMIN: 'admin',
  SUPER_ADMIN: 'super_admin',
} as const;

export type UserRole = (typeof UserRole)[keyof typeof UserRole];
