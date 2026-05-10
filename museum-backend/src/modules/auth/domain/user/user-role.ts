/**
 * Role-based access control roles for Musaium users.
 *
 * Hierarchy (most → least privileged):
 *   super_admin    — Musaium platform operator (Tim). Full access incl. ops
 *                    surfaces (Grafana, multi-tenant data). Distinct from
 *                    `admin` so B2B museum operators cannot reach ops data.
 *   admin          — B2B museum operator with full admin panel access for
 *                    their tenant (audit logs, reports, support). NOT
 *                    granted multi-tenant ops visibility.
 *   museum_manager — B2B museum content manager (artworks, walks).
 *   moderator      — content review (reports, feedback).
 *   visitor        — default end-user role.
 *
 * A super_admin implicitly satisfies any role check; this escalation is
 * centralized in `requireRole` so call sites only need to list the
 * minimum tier required. Adding a new admin route therefore cannot
 * accidentally lock the platform owner out.
 */
export const UserRole = {
  VISITOR: 'visitor',
  MODERATOR: 'moderator',
  MUSEUM_MANAGER: 'museum_manager',
  ADMIN: 'admin',
  SUPER_ADMIN: 'super_admin',
} as const;

/** Union of every UserRole value. */
export type UserRole = (typeof UserRole)[keyof typeof UserRole];
