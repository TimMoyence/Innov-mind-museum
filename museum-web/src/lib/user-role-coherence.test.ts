/**
 * P0-6 — UserRole coherence (audit 2026-05-12, details/03-dry.md P0-3)
 *
 * RED PHASE — these assertions exist to fail today and to pass once
 * `admin-types.UserRole` is aligned with `auth.UserRole` (single source of
 * truth, ideally a re-export). Do NOT modify the underlying types from this
 * test — the implementer is responsible for the fix.
 *
 * Why this matters: production code in `AdminShell.tsx` and
 * `app/[locale]/admin/ops/grafana/layout.tsx` references the literal
 * `'super_admin'` against `auth.tsx:UserRole` (5 values), while
 * `app/[locale]/admin/users/page.tsx` casts `u.role as UserRole` using the
 * `admin-types.ts` union (4 values, missing `'super_admin'`). A super_admin
 * user therefore silently:
 *   - hits `ROLE_COLORS[u.role as UserRole] === undefined` (broken badge),
 *   - is absent from `ALL_ROLES` filter / grant menus,
 *   - is invisible to any future `switch (role)` exhaustiveness checks
 *     written against the narrower union.
 *
 * The two assertions below produce a tsc error (compile-time RED signal that
 * `pnpm lint` will surface) AND a runtime assertion (vitest RED signal that
 * `pnpm test` will surface once the type-level check compiles). Both must
 * pass once the impl phase aligns the two unions.
 */

import { describe, expect, it } from 'vitest';
import type { UserRole as AdminUserRole } from './admin-types';
import type { UserRole as AuthUserRole } from './auth';

// Mutual-`extends` equality for two unions. Resolves to `true` only when each
// union assigns into the other (i.e. they have identical members). The classic
// `(<T>() => T extends X ? …)` trick is stricter w.r.t. variance but trips
// `@typescript-eslint/no-unnecessary-type-parameters`; for plain string-literal
// unions this mutual-`extends` form is equivalent.
type UnionsEqual<X, Y> = [X] extends [Y] ? ([Y] extends [X] ? true : false) : false;

describe('UserRole coherence (P0-6)', () => {
  it('admin-types.UserRole and auth.UserRole describe the same union', () => {
    // tsc RED: today `UnionsEqual<AdminUserRole, AuthUserRole>` resolves to
    // `false` because admin-types.UserRole is missing `'super_admin'`. The
    // literal `true` annotation is therefore a type error at compile time
    // and `pnpm lint` exits non-zero. Once admin-types.UserRole is widened
    // to include `'super_admin'` (or re-exported from auth), the assertion
    // compiles and the runtime expectation below passes.
    const coherent: UnionsEqual<AdminUserRole, AuthUserRole> = true;
    expect(coherent).toBe(true);
  });

  it("admin-types.UserRole includes 'super_admin'", () => {
    // tsc RED: today `'super_admin'` is not assignable to AdminUserRole.
    // The literal-typed const makes the failure explicit at the declaration
    // site rather than buried in a downstream component.
    const role: AdminUserRole = 'super_admin';
    expect(role).toBe('super_admin');
  });

  it("auth.UserRole includes 'super_admin' (regression guard)", () => {
    // Sanity check on the SoT side. Already green today; included so a future
    // accidental narrowing of auth.UserRole (e.g. someone "consolidating" the
    // two unions by *removing* super_admin from auth.tsx) is caught here too.
    const role: AuthUserRole = 'super_admin';
    expect(role).toBe('super_admin');
  });
});
