import { describe, expect, it } from 'vitest';

import {
  ROLE_BADGE_CLASSES,
  USER_ROLES,
  assignableRoles,
  canChangeRole,
  isAdminRole,
} from '@/lib/admin-roles';
import type { UserRole } from '@/lib/admin-types';

describe('isAdminRole', () => {
  it.each([
    ['admin', true],
    ['super_admin', true],
    ['museum_manager', false],
    ['moderator', false],
    ['visitor', false],
    [undefined, false],
  ] as const)('%s → %s', (role, expected) => {
    expect(isAdminRole(role)).toBe(expected);
  });
});

describe('canChangeRole', () => {
  it.each([
    ['super_admin', 'super_admin', true],
    ['super_admin', 'admin', true],
    ['super_admin', 'visitor', true],
    ['admin', 'super_admin', false],
    ['admin', 'admin', true],
    ['admin', 'visitor', true],
    ['moderator', 'visitor', false],
    ['museum_manager', 'visitor', false],
    ['visitor', 'visitor', false],
    [undefined, 'visitor', false],
  ] as [UserRole | undefined, UserRole, boolean][])(
    'viewer %s on a %s target → %s',
    (viewer, target, expected) => {
      expect(canChangeRole(viewer, target)).toBe(expected);
    },
  );
});

describe('USER_ROLES', () => {
  it('lists the five roles from the least to the most privileged, each once', () => {
    expect(USER_ROLES).toEqual(['visitor', 'moderator', 'museum_manager', 'admin', 'super_admin']);
  });

  it('gives every role a badge', () => {
    expect(Object.keys(ROLE_BADGE_CLASSES).sort()).toEqual([...USER_ROLES].sort());
  });
});

describe('assignableRoles', () => {
  it.each([
    ['super_admin', ['visitor', 'moderator', 'museum_manager', 'admin', 'super_admin']],
    ['admin', ['visitor', 'moderator', 'museum_manager', 'admin']],
    ['museum_manager', ['visitor', 'moderator', 'museum_manager', 'admin']],
    [undefined, ['visitor', 'moderator', 'museum_manager', 'admin']],
  ] as [UserRole | undefined, UserRole[]][])('viewer %s → %j', (viewer, expected) => {
    expect(assignableRoles(viewer)).toEqual(expected);
  });

  it('offers super_admin exactly to the viewers allowed to change a super_admin', () => {
    for (const viewer of [...USER_ROLES, undefined]) {
      expect(assignableRoles(viewer).includes('super_admin')).toBe(
        viewer === 'super_admin' && canChangeRole(viewer, 'super_admin'),
      );
    }
  });
});
