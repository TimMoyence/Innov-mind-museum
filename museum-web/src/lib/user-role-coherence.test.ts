import { describe, expect, it } from 'vitest';
import type { UserRole as AdminUserRole } from './admin-types';
import type { UserRole as AuthUserRole } from './auth';

type UnionsEqual<X, Y> = [X] extends [Y] ? ([Y] extends [X] ? true : false) : false;

describe('UserRole coherence (P0-6)', () => {
  it('admin-types.UserRole and auth.UserRole describe the same union', () => {
    const coherent: UnionsEqual<AdminUserRole, AuthUserRole> = true;
    expect(coherent).toBe(true);
  });

  it("admin-types.UserRole includes 'super_admin'", () => {
    const role: AdminUserRole = 'super_admin';
    expect(role).toBe('super_admin');
  });

  it("auth.UserRole includes 'super_admin' (regression guard)", () => {
    const role: AuthUserRole = 'super_admin';
    expect(role).toBe('super_admin');
  });
});
