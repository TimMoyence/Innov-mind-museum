import { allOf, type UserRole } from '@/lib/admin-types';

export const USER_ROLES = allOf<UserRole>({
  visitor: true,
  moderator: true,
  museum_manager: true,
  admin: true,
  super_admin: true,
});

export const ROLE_BADGE_CLASSES: Readonly<Record<UserRole, string>> = {
  super_admin: 'bg-purple-100 text-purple-800',
  admin: 'bg-red-100 text-red-700',
  museum_manager: 'bg-purple-100 text-purple-700',
  moderator: 'bg-blue-100 text-blue-700',
  visitor: 'bg-gray-100 text-gray-700',
};

const ADMIN_ROLES: ReadonlySet<UserRole> = new Set<UserRole>(['admin', 'super_admin']);

const mayHandleRole = (viewer: UserRole | undefined, role: UserRole): boolean =>
  role !== 'super_admin' || viewer === 'super_admin';

export const isAdminRole = (role: UserRole | undefined): boolean =>
  role !== undefined && ADMIN_ROLES.has(role);

export const canChangeRole = (viewer: UserRole | undefined, target: UserRole): boolean =>
  isAdminRole(viewer) && mayHandleRole(viewer, target);

export const assignableRoles = (viewer: UserRole | undefined): readonly UserRole[] =>
  USER_ROLES.filter((role) => mayHandleRole(viewer, role));
