/** Role-based access control roles for Musaium users. */
export const UserRole = {
  VISITOR: 'visitor',
  MODERATOR: 'moderator',
  MUSEUM_MANAGER: 'museum_manager',
  ADMIN: 'admin',
} as const;

export type UserRole = (typeof UserRole)[keyof typeof UserRole];
