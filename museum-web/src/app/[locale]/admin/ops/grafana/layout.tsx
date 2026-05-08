import type { ReactNode } from 'react';
import { RoleGuard } from '@/lib/auth';

/**
 * Ops sub-tree layout — gates the Grafana iframe panel to `super_admin`
 * exclusively. B2B museum operators (`admin` role) MUST NOT reach this
 * surface because the embedded Grafana dashboard exposes cross-tenant
 * latency / cache data without a `museumId` scope.
 *
 * The route is also gated server-side by nginx `auth_request →
 * GET /api/auth/super-admin-check`. This `RoleGuard` is the client-side
 * defense-in-depth so a `moderator` or `admin` who hits `/admin/ops/...`
 * sees the museum-web denied UI rather than a raw 401 from the iframe.
 */
export default function OpsLayout({ children }: { children: ReactNode }) {
  return <RoleGuard allowedRoles={['super_admin']}>{children}</RoleGuard>;
}
