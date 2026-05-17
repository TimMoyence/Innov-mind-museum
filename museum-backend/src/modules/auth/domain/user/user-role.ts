/**
 * RBAC roles (most → least privileged):
 *   super_admin    — Musaium platform operator. Full access incl. ops surfaces
 *                    (Grafana, multi-tenant data). Distinct from `admin` so B2B
 *                    museum operators cannot reach ops data.
 *   admin          — B2B museum operator, full admin panel for their tenant.
 *                    NOT granted multi-tenant ops visibility.
 *   museum_manager — B2B content manager (artworks, walks).
 *   moderator      — content review (reports, feedback).
 *   visitor        — default end-user role.
 *
 * super_admin implicitly satisfies any role check (centralized in `requireRole`),
 * so adding a new admin route cannot accidentally lock the platform owner out.
 */
export const UserRole = {
  VISITOR: 'visitor',
  MODERATOR: 'moderator',
  MUSEUM_MANAGER: 'museum_manager',
  ADMIN: 'admin',
  SUPER_ADMIN: 'super_admin',
} as const;

export type UserRole = (typeof UserRole)[keyof typeof UserRole];
